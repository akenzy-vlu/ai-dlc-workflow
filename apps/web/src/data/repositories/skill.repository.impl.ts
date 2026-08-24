import type { SkillRepository } from '@domain/repositories';
import { useInstallSkillMutation, useListSkillsQuery } from '../datasource/remote';
import { adaptCommand, adaptQuery } from './adapt';

export const skillRepository: SkillRepository = {
  useSkills: () => adaptQuery(useListSkillsQuery()),
  useInstallSkill: () => {
    const [trigger, state] = useInstallSkillMutation();
    return adaptCommand(trigger, state);
  },
};
