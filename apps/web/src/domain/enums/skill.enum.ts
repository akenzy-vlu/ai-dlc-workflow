/**
 * Where a skill is meant to live once installed. Declared by the package itself, in its
 * SKILL.md, so it is a property of the skill rather than a choice made at install time.
 */
export type SkillScope = 'global' | 'project';

/** `outdated` means *differs from this checkout*, not *older* — the check is a digest. */
export type SkillInstallationState = 'not-installed' | 'up-to-date' | 'outdated';
