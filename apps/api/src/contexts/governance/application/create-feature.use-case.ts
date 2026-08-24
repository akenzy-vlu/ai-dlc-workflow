import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import * as path from 'node:path';

import { FeatureSlug } from '../../../shared/kernel';
import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import { UseCase } from '../../../shared/application/use-case';
import {
  FEATURE_SCAFFOLD_WRITER,
  FeatureScaffoldWriterPort,
  IntentDraft,
} from '../../planning/domain/ports/feature-scaffold.port';
import { FeatureSnapshotAssembler } from '../../insight/application/feature-snapshot.assembler';
import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import { GATE_CONTROLLER, GateControllerPort } from '../domain/ports/gate-controller.port';

export interface CreateFeatureInput {
  repositoryId: string;
  slug: string;
  profile?: string | null;
  intent?: IntentDraft;
}

export interface CreateFeatureResult {
  repositoryId: string;
  slug: string;
  directory: string;
  intentWritten: boolean;
  output: string;
  command: string;
}

@Injectable()
export class CreateFeatureUseCase implements UseCase<CreateFeatureInput, CreateFeatureResult> {
  constructor(
    @Inject(GATE_CONTROLLER) private readonly controller: GateControllerPort,
    @Inject(FEATURE_SCAFFOLD_WRITER) private readonly scaffold: FeatureScaffoldWriterPort,
    private readonly repositories: RepositoryMaintenance,
    private readonly assembler: FeatureSnapshotAssembler,
    private readonly fs: FileSystem,
  ) {}

  async execute(input: CreateFeatureInput): Promise<CreateFeatureResult> {
    const repository = await this.repositories.require(input.repositoryId);

    // Validate the slug before touching the filesystem: it becomes a directory name, and
    // it is the feature's identity everywhere afterwards.
    const slug = FeatureSlug.create(input.slug.trim().toLowerCase().replace(/\s+/g, '-')).value;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new BadRequestException(
        `"${input.slug}" is not a usable slug — lowercase letters, digits and hyphens only`,
      );
    }

    const directory = path.join(repository.featuresDirectory, slug);
    if (await this.fs.isDirectory(directory)) {
      throw new ConflictException(`${slug} already exists in ${repository.label}`);
    }

    // The profile has to be one the repo actually declares, or every gate check afterwards
    // reports against conventions that are not this repository's.
    const profile = input.profile?.trim() || repository.settings.profile;

    const outcome = await this.controller.init(directory, slug, profile === 'none' ? null : profile);
    if (!outcome.accepted) {
      throw new ConflictException(outcome.output || 'the controller refused to initialise this feature');
    }

    const intentWritten = input.intent
      ? await this.scaffold.writeIntent(directory, slug, input.intent)
      : false;

    this.assembler.invalidate(input.repositoryId);

    return {
      repositoryId: input.repositoryId,
      slug,
      directory,
      intentWritten,
      output: outcome.output,
      command: outcome.command,
    };
  }
}
