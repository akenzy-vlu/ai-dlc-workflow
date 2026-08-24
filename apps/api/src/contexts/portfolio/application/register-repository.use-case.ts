import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'node:path';

import { RepositoryId } from '../../../shared/kernel';
import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import { UseCase } from '../../../shared/application/use-case';
import { TrackedRepository } from '../domain/model/tracked-repository';
import { REPOSITORY_INSPECTOR, RepositoryInspectorPort } from '../domain/ports/repository-inspector.port';
import { REPOSITORY_REGISTRY, RepositoryRegistryPort } from '../domain/ports/repository-registry.port';

export interface RegisterRepositoryInput {
  absolutePath: string;
  label?: string;
}

@Injectable()
export class RegisterRepositoryUseCase implements UseCase<RegisterRepositoryInput, TrackedRepository> {
  constructor(
    @Inject(REPOSITORY_REGISTRY) private readonly registry: RepositoryRegistryPort,
    @Inject(REPOSITORY_INSPECTOR) private readonly inspector: RepositoryInspectorPort,
    private readonly fs: FileSystem,
  ) {}

  async execute(input: RegisterRepositoryInput): Promise<TrackedRepository> {
    const absolutePath = path.resolve(input.absolutePath.replace(/^~/, process.env.HOME ?? '~'));

    if (!(await this.fs.isDirectory(absolutePath))) {
      throw new NotFoundException(`not a directory: ${absolutePath}`);
    }
    // Registering a repo with no `.ai/` is almost always a typo'd path, and it would
    // otherwise sit in the portfolio forever showing zero features.
    if (!(await this.fs.isDirectory(path.join(absolutePath, '.ai')))) {
      throw new NotFoundException(`no .ai/ directory in ${absolutePath} — is this an AI-DLC repo?`);
    }
    if (await this.registry.findByPath(absolutePath)) {
      throw new ConflictException(`already tracked: ${absolutePath}`);
    }

    const label = (input.label ?? path.basename(absolutePath)).trim();
    const repository = TrackedRepository.register({
      id: await this.allocateId(label),
      label,
      absolutePath,
    });

    const [settings, git] = await Promise.all([
      this.inspector.readSettings(absolutePath),
      this.inspector.readGitMetadata(absolutePath),
    ]);
    repository.observe(settings, git);

    await this.registry.save(repository);
    return repository;
  }

  /** Labels collide across a portfolio (two `erp` checkouts); ids must not. */
  private async allocateId(label: string): Promise<RepositoryId> {
    const base = label.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'repo';
    const taken = new Set((await this.registry.findAll()).map((r) => r.id.value));
    if (!taken.has(base)) return RepositoryId.create(base);
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!taken.has(candidate)) return RepositoryId.create(candidate);
    }
  }
}
