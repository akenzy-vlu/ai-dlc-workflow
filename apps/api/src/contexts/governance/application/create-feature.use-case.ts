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

const SEQUENCE_CEILING = 99;
/** Matches `YYYYMMDDNN-<name>`, and the shorter `YYYYMMDD-` written before sequences existed. */
const DATED_DIRECTORY = /^(\d{8})(\d{2})?-(.+)$/;

function datestamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

/**
 * The day's next slot: its highest number plus one, not a count. A count would hand a
 * deleted feature's number to the next plan, and the number is identity — two histories
 * would end up pointing at one name.
 */
function nextSequence(entries: string[], date: string): number {
  const used = entries
    .map((entry) => DATED_DIRECTORY.exec(entry))
    .filter((m): m is RegExpExecArray => m !== null && m[1] === date && m[2] !== undefined)
    .map((m) => Number(m[2]));
  return Math.max(0, ...used) + 1;
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

    // Feature directories are `YYYYMMDDNN-<name>`, matching what `aidlc init` does on its
    // own. The stamp is part of the identity: the same feature name comes back later as a
    // different plan, and sharing a directory would hand it the earlier plan's trail and
    // gate. A name already taken under any stamp is a conflict, not a second folder.
    const entries = await this.fs.listDirectories(repository.featuresDirectory);
    const taken = entries.find((entry) => (DATED_DIRECTORY.exec(entry)?.[3] ?? entry) === slug);
    if (taken) {
      throw new ConflictException(`${taken} already exists in ${repository.label}`);
    }

    const date = datestamp();
    const sequence = nextSequence(entries, date);
    if (sequence > SEQUENCE_CEILING) {
      throw new ConflictException(
        `${date} already holds ${SEQUENCE_CEILING} features in ${repository.label}`,
      );
    }
    const directoryName = `${date}${String(sequence).padStart(2, '0')}-${slug}`;
    const directory = path.join(repository.featuresDirectory, directoryName);

    // The profile has to be one the repo actually declares, or every gate check afterwards
    // reports against conventions that are not this repository's.
    const profile = input.profile?.trim() || repository.settings.profile;

    const outcome = await this.controller.init(directory, directoryName, profile === 'none' ? null : profile);
    if (!outcome.accepted) {
      throw new ConflictException(outcome.output || 'the controller refused to initialise this feature');
    }

    const intentWritten = input.intent
      ? await this.scaffold.writeIntent(directory, slug, input.intent)
      : false;

    this.assembler.invalidate(input.repositoryId);

    return {
      // The directory name is the feature's identity everywhere afterwards — the state
      // file's slug, the registry key, this console's URLs — so it is what we hand back.
      repositoryId: input.repositoryId,
      slug: directoryName,
      directory,
      intentWritten,
      output: outcome.output,
      command: outcome.command,
    };
  }
}
