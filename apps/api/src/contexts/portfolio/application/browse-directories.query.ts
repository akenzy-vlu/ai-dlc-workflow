import { Inject, Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { RefusedError } from '../../../shared/kernel';
import { RepositoryMaintenance } from './repository-maintenance.use-case';

export interface DirectoryEntry {
  name: string;
  absolutePath: string;
  /** Has a `.git`, so it is plausibly something to track. */
  isRepository: boolean;
  /** Has an `.ai/` directory — already planned with AI-DLC. */
  hasPlans: boolean;
  alreadyTracked: boolean;
}

export interface DirectoryListing {
  path: string;
  /** Null at a configured root, which is what stops the UI offering a way above it. */
  parent: string | null;
  roots: string[];
  entries: DirectoryEntry[];
}

/**
 * Walks directories so the browser can offer a picker at all.
 *
 * A file input cannot do this job: `showDirectoryPicker()` hands back a handle whose only
 * identity is `.name`, and `webkitdirectory` yields paths relative to the chosen folder.
 * Neither produces the absolute path the registry stores, so the listing has to come from
 * the side that actually has a filesystem.
 */
@Injectable()
export class BrowseDirectories {
  constructor(
    @Inject(AIDLC_CONFIG) private readonly config: AidlcConfig,
    private readonly repositories: RepositoryMaintenance,
  ) {}

  async list(target?: string): Promise<DirectoryListing> {
    const roots = this.config.browseRoots;
    const current = path.resolve(target?.trim() || roots[0]);

    const root = roots.find((candidate) => current === candidate || current.startsWith(`${candidate}${path.sep}`));
    if (!root) {
      throw new RefusedError(
        `refused: ${current} is outside the directories this console may browse`,
        { path: current, roots },
      );
    }

    const tracked = new Set((await this.repositories.list()).map((r) => r.absolutePath));

    let dirents;
    try {
      dirents = await fs.readdir(current, { withFileTypes: true });
    } catch (cause) {
      throw new RefusedError(`refused: cannot read ${current} — ${(cause as Error).message}`, {
        path: current,
      });
    }

    const entries = await Promise.all(
      dirents
        // Dotfiles are noise here, and `.git` itself is never a thing to track.
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(async (entry): Promise<DirectoryEntry> => {
          const absolutePath = path.join(current, entry.name);
          const [isRepository, hasPlans] = await Promise.all([
            exists(path.join(absolutePath, '.git')),
            exists(path.join(absolutePath, '.ai')),
          ]);
          return {
            name: entry.name,
            absolutePath,
            isRepository,
            hasPlans,
            alreadyTracked: tracked.has(absolutePath),
          };
        }),
    );

    entries.sort((a, b) => a.name.localeCompare(b.name));

    return {
      path: current,
      parent: current === root ? null : path.dirname(current),
      roots,
      entries,
    };
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
