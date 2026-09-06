import type { SkillFileContent, SkillFileNode } from '../entities';
import type { QueryResult } from './query.types';

/**
 * A skill package's file tree and file contents, for the browse-and-read drawer.
 *
 * Derived from disk on every read, same as `SkillRepository` — nothing about a
 * skill's files is held in console state.
 */
export interface SkillFileRepository {
  useSkillFiles(skillId: string): QueryResult<SkillFileNode[]>;
  useSkillFileContent(skillId: string, path: string): QueryResult<SkillFileContent>;
}
