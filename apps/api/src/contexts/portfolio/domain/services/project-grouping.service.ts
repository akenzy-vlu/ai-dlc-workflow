import * as path from 'node:path';

import { TrackedRepository } from '../model/tracked-repository';
import { Project, ProjectKey, ProjectOrigin, normaliseRemote } from '../model/project';

/**
 * Decides which checkouts are the same project.
 *
 * The precedence is deliberate and each step exists for a case seen in a real portfolio:
 *
 * 1. **Override** — two clones with different remotes that are still one project, or two
 *    that share a remote and are genuinely managed apart. Only a person knows.
 * 2. **Worktree** — `git rev-parse --git-common-dir` differs from `--git-dir`, so this
 *    checkout is a linked worktree. Its siblings share the common dir exactly.
 * 3. **Remote** — the ordinary case: two clones of `github.com/owner/repo` on different
 *    branches. This is what collapses a nine-checkout portfolio into eight projects.
 * 4. **Path** — no git, or no remote. A project of one, named after its directory.
 *
 * A pure function of the repositories it is handed, so it can be reasoned about without a
 * filesystem.
 */
export class ProjectGroupingService {
  keyFor(repository: TrackedRepository): ProjectKey {
    const override = repository.projectOverride;
    if (override) return ProjectKey.create(override, 'override');

    const git = repository.git;
    if (git?.isWorktree && git.commonDir) {
      // The common dir is the primary checkout's `.git`; its parent is the project root.
      return ProjectKey.create(`worktree:${path.dirname(git.commonDir)}`, 'worktree');
    }

    const remote = git?.remoteUrl ? normaliseRemote(git.remoteUrl) : null;
    if (remote) return ProjectKey.create(`remote:${remote}`, 'remote');

    return ProjectKey.create(`path:${repository.absolutePath}`, 'path');
  }

  group(repositories: readonly TrackedRepository[]): Project[] {
    const buckets = new Map<string, { key: ProjectKey; members: TrackedRepository[] }>();

    for (const repository of repositories) {
      const key = this.keyFor(repository);
      const bucket = buckets.get(key.value);
      if (bucket) bucket.members.push(repository);
      else buckets.set(key.value, { key, members: [repository] });
    }

    return [...buckets.values()]
      .map(({ key, members }) => ({
        key: key.value,
        label: this.labelFor(key, members),
        origin: key.origin,
        repositoryIds: members.map((m) => m.id.value).sort(),
        remoteUrl: members.find((m) => m.git?.remoteUrl)?.git?.remoteUrl ?? null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * The last path segment of the remote, or the shortest member label.
   *
   * Shortest rather than first because a clone is usually named after the project plus a
   * qualifier — `jack-erp` and `erp2` for one project — and the bare name reads better as
   * the group heading than whichever happened to be registered first.
   */
  private labelFor(key: ProjectKey, members: TrackedRepository[]): string {
    if (key.origin === 'remote') {
      const tail = key.value.split('/').pop();
      if (tail) return tail;
    }
    if (key.origin === 'override') return key.value;
    return [...members].sort((a, b) => a.label.length - b.label.length || a.label.localeCompare(b.label))[0]
      .label;
  }
}

export type { Project, ProjectOrigin };
