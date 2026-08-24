import type { PortfolioRepository } from '@domain/repositories';
import {
  useAddRepositoryMutation,
  useBrowseDirectoriesQuery,
  useGetPickerCapabilityQuery,
  usePickFolderNativelyMutation,
  useDiscoverRepositoriesMutation,
  useGetPortfolioQuery,
  useGetToolingQuery,
  useListProjectsQuery,
  useListRepositoriesQuery,
  useRemoveRepositoryMutation,
  useRescanRepositoriesMutation,
  useUpdateRepositoryMutation,
} from '../datasource/remote';
import { adaptCommand, adaptQuery } from './adapt';

/**
 * Binds the portfolio port to the RTK Query endpoints.
 *
 * A repository of hooks rather than of plain functions, because the caching, the
 * invalidation and the subscription lifecycle all live in the hook — wrapping them in
 * imperative methods would mean reimplementing every one of those by hand.
 */
export const portfolioRepository: PortfolioRepository = {
  useRepositories: () => adaptQuery(useListRepositoriesQuery()),
  useProjects: () => adaptQuery(useListProjectsQuery()),
  usePortfolio: () => adaptQuery(useGetPortfolioQuery()),
  useTooling: () => adaptQuery(useGetToolingQuery()),
  useDirectories: (path) => adaptQuery(useBrowseDirectoriesQuery(path)),
  usePickerCapability: () => adaptQuery(useGetPickerCapabilityQuery()),
  usePickFolderNatively: () => {
    const [trigger, state] = usePickFolderNativelyMutation();
    return adaptCommand(trigger, state);
  },

  useAddRepository: () => {
    const [trigger, state] = useAddRepositoryMutation();
    return adaptCommand(trigger, state);
  },
  useDiscoverRepositories: () => {
    const [trigger, state] = useDiscoverRepositoriesMutation();
    return adaptCommand(trigger, state);
  },
  useRescan: () => {
    const [trigger, state] = useRescanRepositoriesMutation();
    return adaptCommand(() => trigger(), state);
  },
  useRemoveRepository: () => {
    const [trigger, state] = useRemoveRepositoryMutation();
    return adaptCommand(trigger, state);
  },
  useUpdateRepository: () => {
    const [trigger, state] = useUpdateRepositoryMutation();
    return adaptCommand(trigger, state);
  },
};
