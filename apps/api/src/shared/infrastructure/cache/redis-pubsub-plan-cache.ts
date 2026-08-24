import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { PlanCache } from './plan-cache';
import type { PlanCachePort } from './plan-cache.port';

/**
 * An in-process plan memo whose *invalidations* are broadcast over Redis.
 *
 * The values never leave the process, and that is the whole point. A `FeatureSnapshot`
 * holds live aggregates — `ConstructionPlan.graph.criticalPath()`, `repository.id.value`
 * — so a cache that serialises would hand back plain objects on a hit and every caller
 * would fail on the first method call. Storing the snapshots in Redis was tried and did
 * exactly that: the first request succeeded and the second returned
 * "construction.graph.criticalPath is not a function".
 *
 * Redis is still doing the job it was brought in for. The reason an in-process cache is
 * not enough across replicas is not storage, it is *coherence*: a plan edited through
 * replica A must not stay stale on replica B for the length of a TTL. Publishing the
 * invalidation achieves that without any aggregate ever being serialised.
 *
 * The alternative — rehydrating four aggregate types and their value objects out of JSON
 * — is a lot of surface that breaks silently whenever a model grows a field, and it buys
 * nothing here: the files on disk are already the source of truth, and a miss costs one
 * re-read.
 */
@Injectable()
export class RedisPubSubPlanCache implements PlanCachePort, OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubPlanCache.name);
  private readonly local: PlanCache;
  private readonly publisher: Redis;
  /** ioredis puts a connection into subscriber mode exclusively, so this is a second one. */
  private readonly subscriber: Redis;
  private readonly channel: string;

  constructor(@Inject(AIDLC_CONFIG) config: AidlcConfig) {
    this.local = new PlanCache(config.planCacheTtlMs);
    this.channel = `${config.redis.keyPrefix}plan-invalidation`;

    this.publisher = new Redis(config.redis.url, { maxRetriesPerRequest: 2 });
    this.subscriber = new Redis(config.redis.url, { maxRetriesPerRequest: 2 });
    for (const client of [this.publisher, this.subscriber]) {
      client.on('error', (error) => this.logger.warn(`redis: ${error.message}`));
    }

    void this.subscriber.subscribe(this.channel).catch((error: Error) => {
      // Degrade to a plain in-process cache rather than refusing to serve. The TTL still
      // bounds staleness; only cross-replica promptness is lost.
      this.logger.warn(`not subscribed to ${this.channel}, invalidations stay local: ${error.message}`);
    });

    this.subscriber.on('message', (_channel, prefix) => {
      // Applied locally only — re-publishing here would make every replica echo every
      // other one forever.
      this.local.invalidate(prefix);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.publisher.quit().catch(() => undefined),
      this.subscriber.quit().catch(() => undefined),
    ]);
  }

  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    return this.local.get(key, load);
  }

  async invalidate(prefix: string): Promise<number> {
    const dropped = this.local.invalidate(prefix);
    await this.publish(prefix);
    return dropped;
  }

  async clear(): Promise<void> {
    this.local.clear();
    // The empty prefix matches every key, which is what `PlanCache.invalidate` already
    // means by it.
    await this.publish('');
  }

  private async publish(prefix: string): Promise<void> {
    try {
      await this.publisher.publish(this.channel, prefix);
    } catch (error) {
      this.logger.warn(`invalidation not broadcast (${prefix || 'all'}): ${(error as Error).message}`);
    }
  }
}
