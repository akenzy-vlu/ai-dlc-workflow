import type { ProjectOrigin } from '../enums';

export interface GitState {
  sha: string;
  branch: string;
  /** False means the plans exist on this machine and nowhere else. */
  aiDirTracked: boolean;
  aiDirDirty: boolean;
  remoteUrl: string | null;
  isWorktree: boolean;
}

/** A checkout the console reads. The only state the console itself owns. */
export interface Repository {
  id: string;
  label: string;
  absolutePath: string;
  profile: string;
  ruleset: number | null;
  /** The layer vocabulary from `.ai/aidlc.yaml`; a ticket outside it is a G3 error. */
  layers: string[];
  configured: boolean;
  hasVerifyBlock: boolean;
  git: GitState | null;
  /** A project key pinned by hand, or null to let git decide. */
  projectOverride: string | null;
  plansLocalOnly: boolean;
  addedAt: string;
  lastScannedAt: string | null;
}

export interface DiscoveredRepository {
  absolutePath: string;
  suggestedLabel: string;
  featureCount: number;
  alreadyTracked: boolean;
}

/**
 * One or more checkouts of the same thing.
 *
 * Two clones of one repository on two branches hold the same plan files; reading them as
 * separate projects doubles every count.
 */
export interface Project {
  key: string;
  label: string;
  origin: ProjectOrigin;
  repositoryIds: string[];
  remoteUrl: string | null;
}

/**
 * Whether the name recorded against an approval can be trusted.
 *
 * `client` means the console takes whatever name the browser sent — fine for one person,
 * not evidence for a team. `trusted-header` means an authenticating proxy supplies it and
 * the body is ignored.
 */
export interface ActingIdentityMode {
  mode: 'client' | 'trusted-header';
  verified: boolean;
  note: string;
}

export interface ToolingStatus {
  available: boolean;
  corePath: string;
  pythonBin: string;
  uowGraphVersion: string | null;
  /** The validation ruleset the installed uow_graph.py judges by. */
  ruleset: number | null;
  verifyAvailable: boolean;
  /** True when the API runs in a container, where a host-installed CLI is invisible. */
  containerized: boolean;
  error: string | null;
}
