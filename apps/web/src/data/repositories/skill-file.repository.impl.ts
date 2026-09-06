import type { SkillFileRepository } from '@domain/repositories';
import { useGetSkillFileContentQuery, useListSkillFilesQuery } from '../datasource/remote';
import { adaptQuery } from './adapt';

export const skillFileRepository: SkillFileRepository = {
  useSkillFiles: (skillId) => adaptQuery(useListSkillFilesQuery(skillId)),
  useSkillFileContent: (skillId, path) => adaptQuery(useGetSkillFileContentQuery({ skillId, path })),
};
