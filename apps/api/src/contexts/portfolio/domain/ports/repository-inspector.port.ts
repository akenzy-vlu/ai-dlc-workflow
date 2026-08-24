import { GitMetadata } from '../model/tracked-repository';
import { RepositorySettings } from '../model/repository-settings';

export const REPOSITORY_INSPECTOR = Symbol('REPOSITORY_INSPECTOR');

export interface DiscoveredRepository {
  absolutePath: string;
  suggestedLabel: string;
  featureCount: number;
  alreadyTracked: boolean;
}

/** Reads what a checkout says about itself. Read-only by contract. */
export interface RepositoryInspectorPort {
  readSettings(repoPath: string): Promise<RepositorySettings>;
  readGitMetadata(repoPath: string): Promise<GitMetadata | null>;
  /** Feature slugs present under `.ai/features/`, whether managed or not. */
  listFeatureSlugs(repoPath: string): Promise<string[]>;
  /** Walks `root` looking for checkouts that contain `.ai/features/`. */
  discover(root: string, maxDepth: number): Promise<DiscoveredRepository[]>;
}
