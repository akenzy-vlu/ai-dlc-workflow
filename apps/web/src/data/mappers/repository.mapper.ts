import type { DiscoveredRepository, Project, Repository, ToolingStatus } from '@domain/entities';
import type {
  DiscoveredRepositoryModel,
  ProjectModel,
  RepositoryModel,
  ToolingStatusModel,
} from '../models';
import { toProjectOrigin } from './enum.mapper';

export const toRepository = (model: RepositoryModel): Repository => ({
  id: model.id,
  label: model.label,
  absolutePath: model.absolutePath,
  profile: model.profile,
  ruleset: model.ruleset,
  layers: model.layers ?? [],
  configured: model.configured,
  hasVerifyBlock: model.hasVerifyBlock,
  git: model.git,
  projectOverride: model.projectOverride ?? null,
  plansLocalOnly: model.plansLocalOnly,
  addedAt: model.addedAt,
  lastScannedAt: model.lastScannedAt,
});

export const toDiscoveredRepository = (model: DiscoveredRepositoryModel): DiscoveredRepository => ({
  ...model,
});

export const toProject = (model: ProjectModel): Project => ({
  key: model.key,
  label: model.label,
  origin: toProjectOrigin(model.origin),
  repositoryIds: model.repositoryIds ?? [],
  remoteUrl: model.remoteUrl,
});

export const toToolingStatus = (model: ToolingStatusModel): ToolingStatus => ({ ...model });
