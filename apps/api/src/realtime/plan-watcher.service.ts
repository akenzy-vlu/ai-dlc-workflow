import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import chokidar, { FSWatcher } from 'chokidar';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig } from '../config/aidlc.config';
import { FeatureSnapshotAssembler } from '../contexts/insight/application/feature-snapshot.assembler';
import { GateVerdictCache } from '../contexts/insight/application/gate-verdict.cache';
import { RepositoryMaintenance } from '../contexts/portfolio/application/repository-maintenance.use-case';
import { PlanEventsGateway } from './plan-events.gateway';

/**
 * Watches every tracked repository's `.ai/features/` tree.
 *
 * Two things make this cheap enough to leave running: it watches only `.ai/`, never the
 * source tree, and it debounces — a `uowg --write` rewrites three files at once and
 * should cost one invalidation, not three.
 */
@Injectable()
export class PlanWatcherService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PlanWatcherService.name);
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly pending = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(AIDLC_CONFIG) private readonly config: AidlcConfig,
    private readonly repositories: RepositoryMaintenance,
    private readonly assembler: FeatureSnapshotAssembler,
    private readonly verdicts: GateVerdictCache,
    private readonly events: PlanEventsGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.resync();
  }

  onApplicationShutdown(): void {
    for (const watcher of this.watchers.values()) void watcher.close();
    for (const timer of this.pending.values()) clearTimeout(timer);
  }

  /** Called after a repository is added or removed. */
  async resync(): Promise<void> {
    const repositories = await this.repositories.list();
    const wanted = new Map(repositories.map((r) => [r.id.value, r.featuresDirectory]));

    for (const [id, watcher] of this.watchers) {
      if (!wanted.has(id)) {
        void watcher.close();
        this.watchers.delete(id);
      }
    }

    for (const [id, directory] of wanted) {
      if (this.watchers.has(id)) continue;
      const watcher = chokidar.watch(directory, {
        ignoreInitial: true,
        depth: 6,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      });
      watcher.on('all', (_event, changed) => this.onChange(id, directory, changed));
      watcher.on('error', (error) => this.logger.warn(`watcher error on ${directory}: ${String(error)}`));
      this.watchers.set(id, watcher);
      this.logger.log(`watching ${directory}`);
    }
  }

  private onChange(repositoryId: string, featuresDirectory: string, changedPath: string): void {
    const relative = path.relative(featuresDirectory, changedPath);
    const slug = relative.split(path.sep)[0] || null;
    const key = `${repositoryId}/${slug ?? '*'}`;

    clearTimeout(this.pending.get(key));
    this.pending.set(
      key,
      setTimeout(() => {
        this.pending.delete(key);
        this.assembler.invalidate(repositoryId, slug ?? undefined);
        if (slug) this.verdicts.invalidate(`${repositoryId}/${slug}`);
        this.events.emit({
          type: 'plan.changed',
          repositoryId,
          slug,
          at: new Date().toISOString(),
        });
      }, 300),
    );
  }
}
