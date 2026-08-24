import type { Skill } from '../model/skill';

export const SKILL_CATALOG = Symbol('SKILL_CATALOG');

/** Reads the installable skill packages out of this checkout. Never writes. */
export interface SkillCatalogPort {
  discover(): Promise<Skill[]>;
  find(id: string): Promise<Skill | null>;
}
