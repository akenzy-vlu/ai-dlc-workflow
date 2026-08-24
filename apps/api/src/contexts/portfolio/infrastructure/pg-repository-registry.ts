import { Injectable } from '@nestjs/common';
import * as path from 'node:path';

import { Postgres } from '../../../shared/infrastructure/db/postgres';
import { RepositoryId } from '../../../shared/kernel';
import { RepositoryRegistryPort } from '../domain/ports/repository-registry.port';
import { RepositorySettings } from '../domain/model/repository-settings';
import { GitMetadata, TrackedRepository } from '../domain/model/tracked-repository';

interface Row {
  id: string;
  label: string;
  absolute_path: string;
  added_at: Date;
  last_scanned_at: Date | null;
  project_override: string | null;
  settings: Record<string, unknown>;
  git: GitMetadata | null;
}

/**
 * The tracked-repository registry in Postgres.
 *
 * The JSON adapter's reasoning still holds for a laptop — this is a few kilobytes of
 * "which folders am I watching", and losing it costs one rescan. What it does not survive
 * is a container: a JSON file lives in one process's filesystem, so two API replicas
 * disagree about what is tracked and a redeploy starts from nothing. That, not size, is
 * why the deployed console keeps it here.
 *
 * Still no plan data. The `.ai/` files are the source of truth and a second copy would
 * start drifting the moment the controller ran.
 */
@Injectable()
export class PgRepositoryRegistry implements RepositoryRegistryPort {
  constructor(private readonly db: Postgres) {}

  async findAll(): Promise<TrackedRepository[]> {
    const rows = await this.db.query<Row>('SELECT * FROM tracked_repository ORDER BY label ASC');
    return rows.map((row) => this.toDomain(row));
  }

  async findById(id: RepositoryId): Promise<TrackedRepository | null> {
    const row = await this.db.one<Row>('SELECT * FROM tracked_repository WHERE id = $1', [id.value]);
    return row ? this.toDomain(row) : null;
  }

  async findByPath(absolutePath: string): Promise<TrackedRepository | null> {
    const row = await this.db.one<Row>('SELECT * FROM tracked_repository WHERE absolute_path = $1', [
      path.resolve(absolutePath),
    ]);
    return row ? this.toDomain(row) : null;
  }

  async save(repository: TrackedRepository): Promise<void> {
    await this.db.query(
      `INSERT INTO tracked_repository
         (id, label, absolute_path, added_at, last_scanned_at, project_override, settings, git)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         label            = EXCLUDED.label,
         absolute_path    = EXCLUDED.absolute_path,
         last_scanned_at  = EXCLUDED.last_scanned_at,
         project_override = EXCLUDED.project_override,
         settings         = EXCLUDED.settings,
         git              = EXCLUDED.git`,
      [
        repository.id.value,
        repository.label,
        repository.absolutePath,
        repository.addedAt,
        repository.lastScannedAt,
        repository.projectOverride,
        JSON.stringify({
          profile: repository.settings.profile,
          ruleset: repository.settings.ruleset,
          layers: [...repository.settings.layers],
          hasVerifyBlock: repository.settings.hasVerifyBlock,
          configured: repository.settings.isConfigured,
        }),
        repository.git ? JSON.stringify(repository.git) : null,
      ],
    );
  }

  async remove(id: RepositoryId): Promise<void> {
    await this.db.query('DELETE FROM tracked_repository WHERE id = $1', [id.value]);
  }

  private toDomain(row: Row): TrackedRepository {
    return TrackedRepository.rehydrate({
      id: RepositoryId.create(row.id),
      label: row.label,
      absolutePath: row.absolute_path,
      settings: RepositorySettings.create(row.settings ?? {}),
      git: row.git,
      addedAt: row.added_at,
      lastScannedAt: row.last_scanned_at,
      projectOverride: row.project_override,
    });
  }
}
