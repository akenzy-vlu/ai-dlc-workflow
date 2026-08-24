/**
 * How a project's identity was decided.
 *
 * Surfaced in the UI, because a grouping the user did not ask for and cannot explain is a
 * grouping they will not trust.
 */
export const PROJECT_ORIGINS = ['override', 'worktree', 'remote', 'path'] as const;
export type ProjectOrigin = (typeof PROJECT_ORIGINS)[number];

export const PROJECT_ORIGIN_EXPLANATIONS: Record<ProjectOrigin, string> = {
  override: 'Pinned by hand on the Repositories page',
  worktree: 'A linked git worktree sharing a common dir',
  remote: 'Same git remote — two clones of one repository',
  path: 'No git remote; a project of one checkout',
};
