import type { SkillFileContent, SkillFileNode } from '@domain/entities';
import type { SkillFileContentModel, SkillFileNodeModel } from '../../models';
import { toSkillFileContent, toSkillFileNode } from '../../mappers';
import { consoleApi } from './api';

export const skillFileEndpoints = consoleApi.injectEndpoints({
  endpoints: (build) => ({
    listSkillFiles: build.query<SkillFileNode[], string>({
      query: (skillId) => `/skills/${skillId}/files`,
      transformResponse: (models: SkillFileNodeModel[]) => models.map(toSkillFileNode),
      providesTags: ['SkillFile'],
    }),

    getSkillFileContent: build.query<SkillFileContent, { skillId: string; path: string }>({
      query: ({ skillId, path }) => ({
        url: `/skills/${skillId}/files/content`,
        params: { path },
      }),
      transformResponse: (model: SkillFileContentModel) => toSkillFileContent(model),
      providesTags: ['SkillFile'],
    }),
  }),
});

export const { useListSkillFilesQuery, useGetSkillFileContentQuery } = skillFileEndpoints;
