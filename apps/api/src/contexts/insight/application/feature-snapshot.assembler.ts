import { Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'node:path';

import { FeatureRef } from '../../../shared/kernel';
import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import { PLAN_CACHE, type PlanCachePort } from '../../../shared/infrastructure/cache/plan-cache.port';
import {
  CONSTRUCTION_PLAN_READER,
  ConstructionPlanReaderPort,
} from '../../construction/domain/ports/plan-reader.port';
import { FEATURE_PLAN_READER, FeaturePlanReaderPort } from '../../planning/domain/ports/feature-plan.port';
import { GATE_STATE_READER, GateStateReaderPort } from '../../governance/domain/ports/gate-state-reader.port';
import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import { TrackedRepository } from '../../portfolio/domain/model/tracked-repository';
import { FeatureSnapshot, snapshotKey } from '../domain/feature-snapshot';

/**
 * Builds the read model by asking each context for its own aggregate and holding the
 * three side by side. It never reaches into another context's internals — only its port.
 *
 * Caching is not an optimisation here, it is what makes the console usable: a portfolio
 * of a hundred features is two thousand ticket files, and re-reading all of them on every
 * request turns a table sort into a five-second stall.
 */
@Injectable()
export class FeatureSnapshotAssembler {
  private readonly logger = new Logger(FeatureSnapshotAssembler.name);

  constructor(
    private readonly repositories: RepositoryMaintenance,
    @Inject(FEATURE_PLAN_READER) private readonly planReader: FeaturePlanReaderPort,
    @Inject(CONSTRUCTION_PLAN_READER) private readonly constructionReader: ConstructionPlanReaderPort,
    @Inject(GATE_STATE_READER) private readonly gateStateReader: GateStateReaderPort,
    @Inject(PLAN_CACHE) private readonly cache: PlanCachePort,
    private readonly fs: FileSystem,
  ) {}

  /** Every feature in every tracked repository. */
  async assembleAll(): Promise<FeatureSnapshot[]> {
    const repositories = await this.repositories.list();
    const perRepository = await Promise.all(repositories.map((repo) => this.assembleRepository(repo)));
    return perRepository.flat();
  }

  async assembleRepository(repository: TrackedRepository): Promise<FeatureSnapshot[]> {
    const slugs = await this.fs.listDirectories(repository.featuresDirectory);
    const snapshots = await Promise.all(
      slugs.map((slug) => this.assemble(repository, slug).catch(() => null)),
    );
    return snapshots.filter((s): s is FeatureSnapshot => s !== null);
  }

  async assembleById(repositoryId: string, slug: string): Promise<FeatureSnapshot | null> {
    const repository = await this.repositories.find(repositoryId);
    if (!repository) return null;
    const directory = path.join(repository.featuresDirectory, slug);
    if (!(await this.fs.isDirectory(directory))) return null;
    return this.assemble(repository, slug);
  }

  async assemble(repository: TrackedRepository, slug: string): Promise<FeatureSnapshot> {
    const key = snapshotKey(repository.id.value, slug);
    return this.cache.get(key, async () => {
      const ref = FeatureRef.create(repository.id, slug);
      const directory = path.join(repository.featuresDirectory, slug);

      const [gateState, plan, construction, modifiedAt] = await Promise.all([
        this.gateStateReader.read(ref, directory),
        this.planReader.read(ref, directory, repository.absolutePath),
        this.constructionReader.read(ref, directory, repository.settings.layers),
        this.fs.modifiedAt(directory),
      ]);

      return { repository, gateState, plan, construction, observedAt: modifiedAt ?? new Date() };
    });
  }

  /**
   * Drops cached snapshots for one feature, one repository, or everything.
   *
   * Stays synchronous for its callers — the filesystem watcher and the maintenance
   * endpoint, neither of which awaits it. Invalidation is best-effort by design: a miss
   * costs one stale read until the TTL lapses, so a Redis blip must not take down the
   * watcher that triggered it.
   */
  invalidate(repositoryId?: string, slug?: string): void {
    const done = !repositoryId
      ? this.cache.clear()
      : this.cache.invalidate(slug ? snapshotKey(repositoryId, slug) : `${repositoryId}/`);

    void Promise.resolve(done).catch((error: Error) =>
      this.logger.warn(`cache invalidation failed, falling back to the TTL: ${error.message}`),
    );
  }
}
