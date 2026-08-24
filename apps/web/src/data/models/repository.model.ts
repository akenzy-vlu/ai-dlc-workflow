export interface GitStateModel {
  sha: string;
  branch: string;
  aiDirTracked: boolean;
  aiDirDirty: boolean;
  remoteUrl: string | null;
  isWorktree: boolean;
}

export interface RepositoryModel {
  id: string;
  label: string;
  absolutePath: string;
  profile: string;
  ruleset: number | null;
  layers: string[];
  configured: boolean;
  hasVerifyBlock: boolean;
  git: GitStateModel | null;
  projectOverride: string | null;
  plansLocalOnly: boolean;
  addedAt: string;
  lastScannedAt: string | null;
}

export interface DiscoveredRepositoryModel {
  absolutePath: string;
  suggestedLabel: string;
  featureCount: number;
  alreadyTracked: boolean;
}

export interface ProjectModel {
  key: string;
  label: string;
  origin: string;
  repositoryIds: string[];
  remoteUrl: string | null;
}

export interface ToolingStatusModel {
  available: boolean;
  corePath: string;
  pythonBin: string;
  uowGraphVersion: string | null;
  ruleset: number | null;
  verifyAvailable: boolean;
  containerized: boolean;
  error: string | null;
}
