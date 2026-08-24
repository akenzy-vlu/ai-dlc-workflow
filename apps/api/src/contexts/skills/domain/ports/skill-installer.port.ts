import type { Skill } from '../model/skill';

export const SKILL_INSTALLER = Symbol('SKILL_INSTALLER');

/**
 * Copies a skill package to an install target, and reports what is already there.
 *
 * The only writing port in this context, and it writes exactly one kind of thing: a skill
 * package under a `.claude/skills/` directory. It never touches `.ai/` — plan state stays
 * the controller's alone.
 */
export interface SkillInstallerPort {
  /** Content digest of an installed package, or null when the directory is absent. */
  digestOf(packagePath: string): Promise<string | null>;

  /**
   * Copies the package over the target, replacing it. Returns the files written.
   *
   * Replacing rather than merging is the point: a merge would leave a file deleted
   * upstream alive at the target forever, and the skill would keep loading a reference
   * that no longer exists in the source.
   */
  install(skill: Skill, targetPath: string): Promise<number>;
}
