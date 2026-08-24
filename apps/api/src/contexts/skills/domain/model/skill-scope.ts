import { InvalidValueError } from '../../../../shared/kernel';

/**
 * Where a skill package is meant to live once installed.
 *
 * This is not a preference, it is a property of the skill. `ai-dlc-core` aggregates plans
 * *across* repositories, so it has to be reachable from all of them — global. A stack
 * profile describes the conventions of exactly one repo, and installing it globally means
 * it loads (and competes to be selected) in every other project on the machine — project.
 *
 * The scope decides which install target is even offered, so getting it wrong is not a
 * cosmetic mistake: a project skill synced globally starts answering for repositories it
 * knows nothing about.
 */
export type SkillScope = 'global' | 'project';

export const SKILL_SCOPES: readonly SkillScope[] = ['global', 'project'] as const;

export function isSkillScope(value: unknown): value is SkillScope {
  return typeof value === 'string' && (SKILL_SCOPES as readonly string[]).includes(value);
}

/**
 * Reads the `scope:` field of a SKILL.md.
 *
 * A package that declares nothing is treated as `project`, the conservative default: the
 * cost of a too-narrow scope is one extra install, while the cost of a wrong global is a
 * skill loading in every repository on the machine.
 */
export function parseSkillScope(raw: unknown): SkillScope {
  if (raw === undefined || raw === null || raw === '') return 'project';
  if (!isSkillScope(raw)) {
    throw new InvalidValueError(
      `unknown skill scope ${JSON.stringify(raw)} — expected 'global' or 'project'`,
    );
  }
  return raw;
}
