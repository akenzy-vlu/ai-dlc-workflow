import type {
  DirectoryListing,
  DiscoveredRepository,
  PickerCapability,
  Portfolio,
  Project,
  Repository,
  ToolingStatus,
} from '../entities';
import type { CommandResult, QueryResult } from './query.types';

/**
 * Tracked checkouts, the projects they group into, and the portfolio read model.
 *
 * Everything here is derived from the plan files on disk except the tracked-repository
 * list itself, which is the one piece of state the console owns.
 */
export interface PortfolioRepository {
  useRepositories(): QueryResult<Repository[]>;
  useProjects(): QueryResult<Project[]>;
  usePortfolio(): QueryResult<Portfolio>;
  useTooling(): QueryResult<ToolingStatus>;
  /** Lists directories for the folder picker. `undefined` starts at the first root. */
  useDirectories(path: string | undefined): QueryResult<DirectoryListing>;
  /** Whether a native OS folder dialog is available, and where browsing may start. */
  usePickerCapability(): QueryResult<PickerCapability>;
  /** Opens the OS folder dialog on the machine running the API. */
  usePickFolderNatively(): CommandResult<{ startAt?: string }, { absolutePath: string }>;

  useAddRepository(): CommandResult<{ absolutePath: string; label?: string }, Repository>;
  useDiscoverRepositories(): CommandResult<
    { root: string; maxDepth?: number },
    DiscoveredRepository[]
  >;
  useRescan(): CommandResult<void, Repository[]>;
  useRemoveRepository(): CommandResult<string, { removed: string }>;
  /** `projectOverride: null` clears the pin and hands the grouping back to git. */
  useUpdateRepository(): CommandResult<
    { id: string; label?: string; projectOverride?: string | null },
    Repository
  >;
}
