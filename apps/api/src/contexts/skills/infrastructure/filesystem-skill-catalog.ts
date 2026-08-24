import { Inject, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { parseFrontmatter } from '../../../shared/infrastructure/text/frontmatter.parser';
import { Skill } from '../domain/model/skill';
import { parseSkillScope } from '../domain/model/skill-scope';
import type { SkillCatalogPort } from '../domain/ports/skill-catalog.port';
import { digestPackage, listPackageFiles } from './skill-digest';

/**
 * Finds skill packages by looking for a `SKILL.md` one level under each configured source
 * root — the same shape Claude Code itself loads, so a package this lists is a package
 * that will load.
 */
@Injectable()
export class FilesystemSkillCatalog implements SkillCatalogPort {
  private readonly logger = new Logger(FilesystemSkillCatalog.name);

  constructor(@Inject(AIDLC_CONFIG) private readonly config: AidlcConfig) {}

  async discover(): Promise<Skill[]> {
    const skills: Skill[] = [];
    for (const root of this.config.skillSources) {
      for (const name of await this.subdirectories(root)) {
        const skill = await this.read(path.join(root, name), root, name);
        if (skill) skills.push(skill);
      }
    }
    // Global first, then alphabetical: the machine-wide ones are the ones a reader is
    // usually checking, and they are few.
    return skills.sort((a, b) => {
      if (a.isGlobal !== b.isGlobal) return a.isGlobal ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  async find(id: string): Promise<Skill | null> {
    return (await this.discover()).find((skill) => skill.id === id) ?? null;
  }

  private async subdirectories(root: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch {
      // A configured source that does not exist is not an error: a container image ships
      // skills/ without examples/, and a checkout may have neither.
      return [];
    }
  }

  private async read(packagePath: string, sourceRoot: string, id: string): Promise<Skill | null> {
    const manifest = path.join(packagePath, 'SKILL.md');
    let text: string;
    try {
      text = await fs.readFile(manifest, 'utf8');
    } catch {
      return null; // not a skill package, just a directory
    }

    const { data, error } = parseFrontmatter(text);
    if (error) {
      this.logger.warn(`skipping ${id}: ${error}`);
      return null;
    }

    const declaredName = single(data.name) ?? id;
    try {
      return Skill.create({
        id,
        declaredName,
        description: single(data.description) ?? '',
        scope: parseSkillScope(single(data.scope)),
        sourcePath: packagePath,
        sourceRoot,
        digest: (await digestPackage(packagePath)) ?? '',
        fileCount: (await listPackageFiles(packagePath)).length,
        nameMismatch: declaredName !== id,
      });
    } catch (cause) {
      // A bad `scope:` disqualifies one package rather than emptying the page.
      this.logger.warn(`skipping ${id}: ${(cause as Error).message}`);
      return null;
    }
  }
}

function single(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}
