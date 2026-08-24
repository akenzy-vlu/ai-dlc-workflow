import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { MIGRATIONS } from './migrations';

/**
 * The Postgres connection, and the migrator that runs before anything queries it.
 *
 * No ORM, deliberately. This codebase already hand-writes a frontmatter parser to match
 * the controller's byte for byte; a mapping layer that generates SQL nobody reads would
 * be out of character, and the schema here is nine tables that change rarely.
 */
@Injectable()
export class Postgres implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Postgres.name);
  private readonly pool: Pool;

  constructor(@Inject(AIDLC_CONFIG) private readonly config: AidlcConfig) {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: config.database.poolMax,
      // A console that cannot reach its database should say so at boot, not hang the
      // first request for the driver's default two minutes.
      connectionTimeoutMillis: 10_000,
    });
    this.pool.on('error', (error) => this.logger.error(`idle client error: ${error.message}`));
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.database.migrateOnBoot) return;
    await this.migrate();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(text, values);
    return result.rows;
  }

  async one<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T | null> {
    return (await this.query<T>(text, values))[0] ?? null;
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Applies unapplied migrations under an advisory lock.
   *
   * The lock is what makes it safe to scale the API past one replica: without it, two
   * containers booting together both see an empty applied-set and both run `001`.
   */
  private async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        id          TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [0x4149444]); // 'AID'
      const applied = new Set(
        (await client.query<{ id: string }>('SELECT id FROM schema_migration')).rows.map((r) => r.id),
      );

      for (const migration of MIGRATIONS) {
        if (applied.has(migration.id)) continue;
        this.logger.log(`applying migration ${migration.id}`);
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migration (id) VALUES ($1)', [migration.id]);
      }
    });
  }
}
