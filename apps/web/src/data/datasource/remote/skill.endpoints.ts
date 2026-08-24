import type { Skill } from '@domain/entities';
import type { InstallSkillResultModel, SkillModel } from '../../models';
import { toSkill } from '../../mappers';
import { consoleApi } from './api';

export const skillEndpoints = consoleApi.injectEndpoints({
  endpoints: (build) => ({
    listSkills: build.query<Skill[], void>({
      query: () => '/skills',
      transformResponse: (models: SkillModel[]) => models.map(toSkill),
      providesTags: ['Skill'],
    }),

    /**
     * One mutation for both scopes: a global skill syncs to this machine, a project skill
     * installs into `repositoryId`. The server decides which from the skill's own scope
     * and refuses a mismatch, so the UI cannot route a stack profile machine-wide.
     */
    installSkill: build.mutation<InstallSkillResultModel, { id: string; repositoryId?: string }>({
      query: ({ id, ...body }) => ({ url: `/skills/${id}/install`, method: 'POST', body }),
      // Only the skill list changes: installing a package writes under .claude/skills and
      // never touches a plan, so the portfolio read models are untouched.
      invalidatesTags: ['Skill'],
    }),
  }),
});

export const { useListSkillsQuery, useInstallSkillMutation } = skillEndpoints;
