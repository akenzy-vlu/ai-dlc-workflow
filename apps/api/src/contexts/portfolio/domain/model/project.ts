import { InvalidValueError, ValueObject } from '../../../../shared/kernel';

/**
 * How a project's identity was decided. Shown in the UI, because a grouping the user did
 * not ask for and cannot explain is a grouping they will not trust.
 */
export type ProjectOrigin = 'override' | 'worktree' | 'remote' | 'path';

export class ProjectKey extends ValueObject<{ value: string; origin: ProjectOrigin }> {
  private constructor(value: string, origin: ProjectOrigin) {
    super({ value, origin });
  }

  static create(value: string, origin: ProjectOrigin): ProjectKey {
    const v = value.trim().toLowerCase();
    if (!v) throw new InvalidValueError('project key must not be empty');
    return new ProjectKey(v, origin);
  }

  get value(): string {
    return this.props.value;
  }
  get origin(): ProjectOrigin {
    return this.props.origin;
  }
  toString(): string {
    return this.props.value;
  }
}

/**
 * Normalises a git remote into a host-and-path identity.
 *
 * `git@github.com:Owner/repo.git`, `https://github.com/Owner/repo.git` and
 * `ssh://git@github.com/Owner/repo` are the same project. Case is folded because git
 * hosts are case-insensitive about owner and repo names while the strings people paste
 * are not.
 */
export function normaliseRemote(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;

  const scp = /^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)(.+)$/.exec(raw);
  const parsed = scp ? { host: scp[1], path: scp[2] } : parseUrlish(raw);
  if (!parsed) return null;

  const path = parsed.path.replace(/^\/+/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  return path ? `${parsed.host.toLowerCase()}/${path.toLowerCase()}` : null;
}

function parseUrlish(raw: string): { host: string; path: string } | null {
  try {
    const url = new URL(raw);
    return { host: url.host, path: url.pathname };
  } catch {
    return null;
  }
}

/**
 * A project: one or more checkouts of the same thing.
 *
 * This exists because a portfolio does not group cleanly by directory. Two clones of one
 * repository on two branches, or a worktree tree, produce near-identical feature lists —
 * and reading them as separate projects doubles every count and makes the portfolio look
 * twice as busy as it is. Grouping is derived, never stored, except for the override.
 */
export interface Project {
  key: string;
  label: string;
  origin: ProjectOrigin;
  repositoryIds: string[];
  /** The remote every member shares, when they share one. */
  remoteUrl: string | null;
}
