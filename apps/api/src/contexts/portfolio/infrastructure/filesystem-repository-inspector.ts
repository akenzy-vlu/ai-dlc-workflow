import { Injectable } from '@nestjs/common';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import { ProcessRunner } from '../../../shared/infrastructure/process/process-runner';
import { asList, asScalar, parseYamlishBlock } from '../../../shared/infrastructure/text/frontmatter.parser';
import { RepositorySettings } from '../domain/model/repository-settings';
import { GitMetadata } from '../domain/model/tracked-repository';
import { DiscoveredRepository, RepositoryInspectorPort } from '../domain/ports/repository-inspector.port';

@Injectable()
export class FilesystemRepositoryInspector implements RepositoryInspectorPort {
  constructor(
    private readonly fs: FileSystem,
    private readonly runner: ProcessRunner,
  ) {}

  async readSettings(repoPath: string): Promise<RepositorySettings> {
    const text = await this.fs.readText(path.join(repoPath, '.ai', 'aidlc.yaml'));
    if (text === null) return RepositorySettings.unconfigured();

    const data = parseYamlishBlock(text);
    const ruleset = Number(asScalar(data['ruleset']));

    return RepositorySettings.create({
      profile: asScalar(data['profile']) || 'none',
      ruleset: Number.isFinite(ruleset) && ruleset > 0 ? ruleset : null,
      layers: asList(data['layers']).map((l) => l.toLowerCase()),
      // A nested block parses to an empty list under the top-level key; either shape
      // means the repo has opted into browser verification.
      hasVerifyBlock: 'verify' in data,
      configured: true,
    });
  }

  async readGitMetadata(repoPath: string): Promise<GitMetadata | null> {
    const git = async (...args: string[]): Promise<string> => {
      const result = await this.runner
        .run('git', ['-C', repoPath, ...args], { timeoutMs: 5_000 })
        .catch(() => null);
      return result && result.code === 0 ? result.stdout.trim() : '';
    };

    const sha = await git('rev-parse', '--short', 'HEAD');
    if (!sha) return null;

    const [branch, tracked, dirty, remoteUrl, gitDirRaw, commonDirRaw] = await Promise.all([
      git('rev-parse', '--abbrev-ref', 'HEAD'),
      git('ls-files', '.ai'),
      git('status', '--porcelain', '.ai'),
      git('remote', 'get-url', 'origin'),
      git('rev-parse', '--git-dir'),
      git('rev-parse', '--git-common-dir'),
    ]);

    // Both come back relative to the checkout when it is the primary one (`.git`), so
    // they are resolved before comparison — otherwise every plain clone reads as its own
    // worktree and the whole grouping collapses.
    const gitDir = gitDirRaw ? path.resolve(repoPath, gitDirRaw) : null;
    const commonDir = commonDirRaw ? path.resolve(repoPath, commonDirRaw) : null;

    return {
      sha,
      branch,
      aiDirTracked: Boolean(tracked),
      aiDirDirty: Boolean(dirty),
      remoteUrl: remoteUrl || null,
      gitDir,
      commonDir,
      isWorktree: Boolean(gitDir && commonDir && gitDir !== commonDir),
    };
  }

  async listFeatureSlugs(repoPath: string): Promise<string[]> {
    return this.fs.listDirectories(path.join(repoPath, '.ai', 'features'));
  }

  /**
   * Walks `root` for checkouts holding `.ai/features/`.
   *
   * Bounded by depth and by a skip-list rather than by a global timeout, because the
   * common case is a `~/Documents/work` tree with a hundred thousand files in
   * `node_modules` — descending into those is the whole cost.
   */
  async discover(root: string, maxDepth: number): Promise<DiscoveredRepository[]> {
    const SKIP = new Set([
      'node_modules', '.git', 'dist', 'build', '.next', 'vendor', 'Pods',
      '.venv', 'venv', '__pycache__', '.dart_tool', 'target', '.gradle', 'Library',
    ]);
    const found: DiscoveredRepository[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > maxDepth) return;

      const featuresDir = path.join(dir, '.ai', 'features');
      if (await this.fs.isDirectory(featuresDir)) {
        const slugs = await this.fs.listDirectories(featuresDir);
        found.push({
          absolutePath: dir,
          suggestedLabel: path.basename(dir),
          featureCount: slugs.length,
          alreadyTracked: false,
        });
        return; // a repo does not nest inside another repo's plan tree
      }

      let entries: import('node:fs').Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      await Promise.all(
        entries
          .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.'))
          .map((e) => walk(path.join(dir, e.name), depth + 1)),
      );
    };

    await walk(path.resolve(root), 0);
    return found.sort((a, b) => a.absolutePath.localeCompare(b.absolutePath));
  }
}
