import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { RepositoryId } from '../../../shared/kernel';
import { Project } from '../domain/model/project';
import { ProjectGroupingService } from '../domain/services/project-grouping.service';
import { TrackedRepository } from '../domain/model/tracked-repository';
import {
  DiscoveredRepository,
  REPOSITORY_INSPECTOR,
  RepositoryInspectorPort,
} from '../domain/ports/repository-inspector.port';
import { REPOSITORY_REGISTRY, RepositoryRegistryPort } from '../domain/ports/repository-registry.port';

@Injectable()
export class RepositoryMaintenance {
  constructor(
    @Inject(REPOSITORY_REGISTRY) private readonly registry: RepositoryRegistryPort,
    @Inject(REPOSITORY_INSPECTOR) private readonly inspector: RepositoryInspectorPort,
    private readonly grouping: ProjectGroupingService,
  ) {}

  /** Every checkout grouped into the projects they are actually checkouts of. */
  async projects(): Promise<Project[]> {
    return this.grouping.group(await this.registry.findAll());
  }

  /** Which project a single checkout belongs to. */
  async projectKeyOf(repository: TrackedRepository): Promise<string> {
    return this.grouping.keyFor(repository).value;
  }

  /** Repository id -> project key, for read models that group by project. */
  async projectIndex(): Promise<Map<string, Project>> {
    const projects = await this.projects();
    const index = new Map<string, Project>();
    for (const project of projects) {
      for (const repositoryId of project.repositoryIds) index.set(repositoryId, project);
    }
    return index;
  }

  /** Pins a checkout to a project, or clears the pin so git decides again. */
  async assignProject(id: string, project: string | null): Promise<TrackedRepository> {
    const repository = await this.require(id);
    repository.assignToProject(project);
    await this.registry.save(repository);
    return repository;
  }

  async list(): Promise<TrackedRepository[]> {
    return this.registry.findAll();
  }

  /** Null rather than throwing — callers that render a list must skip, not fail. */
  async find(id: string): Promise<TrackedRepository | null> {
    return this.registry.findById(RepositoryId.create(id));
  }

  async require(id: string): Promise<TrackedRepository> {
    const repository = await this.registry.findById(RepositoryId.create(id));
    if (!repository) throw new NotFoundException(`repository not tracked: ${id}`);
    return repository;
  }

  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.registry.remove(RepositoryId.create(id));
  }

  async rename(id: string, label: string): Promise<TrackedRepository> {
    const repository = await this.require(id);
    repository.rename(label);
    await this.registry.save(repository);
    return repository;
  }

  /** Re-reads `.ai/aidlc.yaml` and git state for every tracked repository. */
  async rescan(): Promise<TrackedRepository[]> {
    const repositories = await this.registry.findAll();
    await Promise.all(
      repositories.map(async (repository) => {
        const [settings, git] = await Promise.all([
          this.inspector.readSettings(repository.absolutePath),
          this.inspector.readGitMetadata(repository.absolutePath),
        ]);
        repository.observe(settings, git);
        await this.registry.save(repository);
      }),
    );
    return repositories;
  }

  /** Suggests repositories under `root`, flagging the ones already on the board. */
  async discover(root: string, maxDepth = 5): Promise<DiscoveredRepository[]> {
    const [candidates, tracked] = await Promise.all([
      this.inspector.discover(root, maxDepth),
      this.registry.findAll(),
    ]);
    const trackedPaths = new Set(tracked.map((r) => r.absolutePath));
    return candidates.map((c) => ({ ...c, alreadyTracked: trackedPaths.has(c.absolutePath) }));
  }
}
