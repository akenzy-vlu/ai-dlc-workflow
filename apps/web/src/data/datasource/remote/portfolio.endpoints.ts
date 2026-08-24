import type {
  DirectoryListing,
  DiscoveredRepository,
  PickerCapability,
  Portfolio,
  Project,
  Repository,
  ToolingStatus,
} from '@domain/entities';
import type {
  DiscoveredRepositoryModel,
  PortfolioModel,
  ProjectModel,
  RepositoryModel,
} from '../../models';
import {
  toDirectoryListing,
  toPickerCapability,
  toDiscoveredRepository,
  toPortfolio,
  toProject,
  toRepository,
  toToolingStatus,
} from '../../mappers';
import { consoleApi } from './api';

export const portfolioEndpoints = consoleApi.injectEndpoints({
  endpoints: (build) => ({
    listRepositories: build.query<Repository[], void>({
      query: () => '/repositories',
      transformResponse: (models: RepositoryModel[]) => models.map(toRepository),
      providesTags: ['Repository'],
    }),

    listProjects: build.query<Project[], void>({
      query: () => '/repositories/projects',
      transformResponse: (models: ProjectModel[]) => models.map(toProject),
      providesTags: ['Project'],
    }),

    getTooling: build.query<ToolingStatus, void>({
      query: () => '/repositories/tooling',
      transformResponse: toToolingStatus,
      providesTags: ['Tooling'],
    }),

    getPortfolio: build.query<Portfolio, void>({
      query: () => '/portfolio',
      transformResponse: (model: PortfolioModel) => toPortfolio(model),
      providesTags: ['Portfolio'],
    }),

    browseDirectories: build.query<DirectoryListing, string | undefined>({
      // The absolute path cannot come from the browser: showDirectoryPicker() exposes only
      // a handle's name and webkitdirectory yields relative paths, so the listing has to
      // come from the side that has a filesystem.
      query: (path) => ({ url: '/repositories/browse', params: path ? { path } : {} }),
      transformResponse: toDirectoryListing,
      // Directories change under us; caching a listing shows a folder that is gone.
      keepUnusedDataFor: 0,
    }),

    getPickerCapability: build.query<PickerCapability, void>({
      query: () => '/repositories/picker',
      transformResponse: toPickerCapability,
    }),

    pickFolderNatively: build.mutation<{ absolutePath: string }, { startAt?: string }>({
      query: (body) => ({ url: '/repositories/pick-folder', method: 'POST', body }),
    }),

    addRepository: build.mutation<Repository, { absolutePath: string; label?: string }>({
      query: (body) => ({ url: '/repositories', method: 'POST', body }),
      transformResponse: toRepository,
      // A new checkout changes every cross-repository read model at once.
      invalidatesTags: ['Repository', 'Project', 'Portfolio', 'Inbox', 'ReadyQueue', 'Board'],
    }),

    discoverRepositories: build.mutation<DiscoveredRepository[], { root: string; maxDepth?: number }>({
      // A scan reads the filesystem and changes nothing; it is a POST only because the
      // root path does not belong in a URL.
      query: (body) => ({ url: '/repositories/discover', method: 'POST', body }),
      transformResponse: (models: DiscoveredRepositoryModel[]) => models.map(toDiscoveredRepository),
    }),

    rescanRepositories: build.mutation<Repository[], void>({
      query: () => ({ url: '/repositories/rescan', method: 'POST' }),
      transformResponse: (models: RepositoryModel[]) => models.map(toRepository),
      invalidatesTags: ['Repository', 'Project', 'Portfolio'],
    }),

    updateRepository: build.mutation<
      Repository,
      { id: string; label?: string; projectOverride?: string | null }
    >({
      query: ({ id, ...body }) => ({ url: `/repositories/${id}`, method: 'PATCH', body }),
      transformResponse: toRepository,
      // A project override regroups the board and the portfolio, not just this row.
      invalidatesTags: ['Repository', 'Project', 'Portfolio', 'Board'],
    }),

    removeRepository: build.mutation<{ removed: string }, string>({
      query: (id) => ({ url: `/repositories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Repository', 'Project', 'Portfolio', 'Inbox', 'ReadyQueue', 'Board'],
    }),
  }),
});

export const {
  useBrowseDirectoriesQuery,
  useLazyBrowseDirectoriesQuery,
  useGetPickerCapabilityQuery,
  usePickFolderNativelyMutation,
  useListRepositoriesQuery,
  useListProjectsQuery,
  useGetToolingQuery,
  useGetPortfolioQuery,
  useAddRepositoryMutation,
  useDiscoverRepositoriesMutation,
  useRescanRepositoriesMutation,
  useUpdateRepositoryMutation,
  useRemoveRepositoryMutation,
} = portfolioEndpoints;
