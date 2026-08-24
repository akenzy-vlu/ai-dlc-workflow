import type { SkillInstallationState, SkillScope } from '../enums';

export interface SkillInstallation {
  /** `global` for the machine-wide target; otherwise a tracked repository's id. */
  targetId: string;
  targetLabel: string;
  targetPath: string;
  state: SkillInstallationState;
}

export interface Skill {
  id: string;
  /** The `name:` in the frontmatter; differs from `id` only in a malformed package. */
  declaredName: string;
  description: string;
  scope: SkillScope;
  /** Where the package lives in this checkout — the copy source, never a destination. */
  sourcePath: string;
  sourceRoot: string;
  digest: string;
  fileCount: number;
  nameMismatch: boolean;
  /**
   * One entry for a global skill; one per tracked repository for a project skill, and
   * none at all when nothing is tracked yet.
   */
  installations: SkillInstallation[];
}
