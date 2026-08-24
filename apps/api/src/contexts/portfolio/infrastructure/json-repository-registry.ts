import { Inject, Injectable } from '@nestjs/common';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { RepositoryId } from '../../../shared/kernel';
import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import { RepositoryRegistryPort } from '../domain/ports/repository-registry.port';
import { RepositorySettings } from '../domain/model/repository-settings';
import { GitMetadata, TrackedRepository } from '../domain/model/tracked-repository';

interface PersistedRepository {
  id: string;
  label: string;
  absolutePath: string;
  addedAt: string;
  lastScannedAt: string | null;
  settings: {
    profile: string;
    ruleset: number | null;
    layers: string[];
    hasVerifyBlock: boolean;
    configured: boolean;
  };
  git: GitMetadata | null;
  projectOverride: string | null;
}

/**
 * A JSON file under `~/.aidlc-console/`.
 *
 * Postgres would be the reflex here, and it would be wrong: this table holds "which
 * folders am I watching", it is single-user, it is a few kilobytes, and losing it costs
 * one rescan. The plan data itself is never persisted — it is re-read from the repos,
 * because the files are the source of truth and a second copy would start drifting.
 */
@Injectable()
export class JsonRepositoryRegistry implements RepositoryRegistryPort {
  private readonly filePath: string;

  constructor(
    @Inject(AIDLC_CONFIG) config: AidlcConfig,
    private readonly fs: FileSystem,
  ) {
    this.filePath = path.join(config.consoleHome, 'repositories.json');
  }

  async findAll(): Promise<TrackedRepository[]> {
    const rows = (await this.fs.readJson<PersistedRepository[]>(this.filePath)) ?? [];
    return rows.map((row) => this.toDomain(row));
  }

  async findById(id: RepositoryId): Promise<TrackedRepository | null> {
    const all = await this.findAll();
    return all.find((r) => r.id.equals(id)) ?? null;
  }

  async findByPath(absolutePath: string): Promise<TrackedRepository | null> {
    const target = path.resolve(absolutePath);
    const all = await this.findAll();
    return all.find((r) => r.absolutePath === target) ?? null;
  }

  async save(repository: TrackedRepository): Promise<void> {
    const rows = (await this.fs.readJson<PersistedRepository[]>(this.filePath)) ?? [];
    const next = rows.filter((r) => r.id !== repository.id.value);
    next.push(this.toPersistence(repository));
    next.sort((a, b) => a.label.localeCompare(b.label));
    await this.fs.writeJson(this.filePath, next);
  }

  async remove(id: RepositoryId): Promise<void> {
    const rows = (await this.fs.readJson<PersistedRepository[]>(this.filePath)) ?? [];
    await this.fs.writeJson(
      this.filePath,
      rows.filter((r) => r.id !== id.value),
    );
  }

  private toDomain(row: PersistedRepository): TrackedRepository {
    return TrackedRepository.rehydrate({
      id: RepositoryId.create(row.id),
      label: row.label,
      absolutePath: row.absolutePath,
      settings: RepositorySettings.create(row.settings ?? {}),
      git: row.git,
      addedAt: new Date(row.addedAt),
      lastScannedAt: row.lastScannedAt ? new Date(row.lastScannedAt) : null,
      projectOverride: row.projectOverride ?? null,
    });
  }

  private toPersistence(repository: TrackedRepository): PersistedRepository {
    return {
      id: repository.id.value,
      label: repository.label,
      absolutePath: repository.absolutePath,
      addedAt: repository.addedAt.toISOString(),
      lastScannedAt: repository.lastScannedAt?.toISOString() ?? null,
      settings: {
        profile: repository.settings.profile,
        ruleset: repository.settings.ruleset,
        layers: [...repository.settings.layers],
        hasVerifyBlock: repository.settings.hasVerifyBlock,
        configured: repository.settings.isConfigured,
      },
      git: repository.git,
      projectOverride: repository.projectOverride,
    };
  }
}
