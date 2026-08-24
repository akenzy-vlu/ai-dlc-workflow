import { Global, Module, type Provider } from '@nestjs/common';

import { AIDLC_CONFIG, loadAidlcConfig, type AidlcConfig } from '../config/aidlc.config';
import { FileSystem } from './infrastructure/fs/file-system';
import { ProcessRunner } from './infrastructure/process/process-runner';
import { PlanCache } from './infrastructure/cache/plan-cache';
import { PLAN_CACHE } from './infrastructure/cache/plan-cache.port';
import { RedisPubSubPlanCache } from './infrastructure/cache/redis-pubsub-plan-cache';
import { Postgres } from './infrastructure/db/postgres';
import { CONSOLE_SETTINGS } from './settings/console-settings.port';
import { FileConsoleSettings } from './settings/file-console-settings';
import { PgConsoleSettings } from './settings/pg-console-settings';

const config = loadAidlcConfig();
const usingPostgres = config.store === 'postgres';

/**
 * Driver selection happens once, here, at module construction.
 *
 * The alternative — asking `config.store` inside each adapter — would mean every adapter
 * carrying both implementations and a branch, and a Postgres client constructed on a
 * laptop that has no Postgres. Binding the symbol once keeps every consumer naming only
 * the port.
 */
const storeProviders: Provider[] = usingPostgres
  ? [
      Postgres,
      { provide: CONSOLE_SETTINGS, useClass: PgConsoleSettings },
      { provide: PLAN_CACHE, useClass: RedisPubSubPlanCache },
    ]
  : [
      { provide: CONSOLE_SETTINGS, useClass: FileConsoleSettings },
      {
        provide: PLAN_CACHE,
        useFactory: (cfg: AidlcConfig) => new PlanCache(cfg.planCacheTtlMs),
        inject: [AIDLC_CONFIG],
      },
    ];

/**
 * The only global module. It provides the collaborators every context needs and nothing
 * else — configuration, filesystem access, the single process runner whose concurrency
 * limit protects the machine from 120 concurrent python subprocesses, and whichever
 * state drivers this deployment selected.
 */
@Global()
@Module({
  providers: [
    { provide: AIDLC_CONFIG, useFactory: () => config },
    FileSystem,
    {
      provide: ProcessRunner,
      useFactory: (cfg: AidlcConfig) => new ProcessRunner(cfg.controllerConcurrency),
      inject: [AIDLC_CONFIG],
    },
    ...storeProviders,
  ],
  exports: [
    AIDLC_CONFIG,
    FileSystem,
    ProcessRunner,
    PLAN_CACHE,
    CONSOLE_SETTINGS,
    // Exported only when it exists; a context asking for it under the file driver is a
    // wiring mistake that should fail loudly at boot rather than inject undefined.
    ...(usingPostgres ? [Postgres] : []),
  ],
})
export class SharedModule {}
