import type { SkillScope } from './skill-scope';

/**
 * Whether the copy at a target matches the copy in this checkout.
 *
 * `outdated` deliberately means *differs*, not *older*. The comparison is a content
 * digest, not an mtime, so a target edited by hand reads as outdated too — which is the
 * honest answer, because syncing will overwrite those edits either way.
 */
export type InstallationState = 'not-installed' | 'up-to-date' | 'outdated';

export interface SkillInstallation {
  /** `global` for the machine-wide target; a repository id for a project target. */
  targetId: string;
  targetLabel: string;
  /** Absolute path the package would occupy at this target. */
  targetPath: string;
  scope: SkillScope;
  state: InstallationState;
  /** Digest of what is installed there now; null when nothing is. */
  installedDigest: string | null;
}

export function stateFor(sourceDigest: string, installedDigest: string | null): InstallationState {
  if (installedDigest === null) return 'not-installed';
  return installedDigest === sourceDigest ? 'up-to-date' : 'outdated';
}
