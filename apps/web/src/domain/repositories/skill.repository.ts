import type { Skill } from '../entities';
import type { SkillInstallationState } from '../enums';
import type { CommandResult, QueryResult } from './query.types';

export interface InstallSkillResult {
  skillId: string;
  targetId: string;
  targetPath: string;
  filesWritten: number;
  previousState: SkillInstallationState;
  state: SkillInstallationState;
}

/**
 * The skill packages this checkout ships, and where each one is installed.
 *
 * Derived from disk on every read — nothing about a skill is held in console state, so a
 * package edited in the working tree shows as `outdated` on the next refresh.
 */
export interface SkillRepository {
  useSkills(): QueryResult<Skill[]>;
  /** `repositoryId` is required for a project skill and refused for a global one. */
  useInstallSkill(): CommandResult<{ id: string; repositoryId?: string }, InstallSkillResult>;
}
