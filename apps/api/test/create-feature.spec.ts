import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CreateFeatureUseCase } from '../src/contexts/governance/application/create-feature.use-case';
import type { FeatureSnapshotAssembler } from '../src/contexts/insight/application/feature-snapshot.assembler';
import type { GateControllerPort } from '../src/contexts/governance/domain/ports/gate-controller.port';
import type { FeatureScaffoldWriterPort } from '../src/contexts/planning/domain/ports/feature-scaffold.port';
import type { RepositoryMaintenance } from '../src/contexts/portfolio/application/repository-maintenance.use-case';
import { FileSystem } from '../src/shared/infrastructure/fs/file-system';

/**
 * The `YYYYMMDDNN-<name>` convention is implemented twice — here and in `aidlc init` — and
 * the console is the half that computes the path *before* the controller sees it. If it
 * drifts, features land in undated folders and nothing complains.
 */
describe('create feature', () => {
  let root: string;
  let featuresDirectory: string;
  let initialised: { directory: string; slug: string } | null;
  let useCase: CreateFeatureUseCase;

  const today = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  };

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aidlc-create-')));
    featuresDirectory = path.join(root, '.ai', 'features');
    await fs.mkdir(featuresDirectory, { recursive: true });
    initialised = null;

    const controller = {
      init: async (directory: string, slug: string) => {
        initialised = { directory, slug };
        await fs.mkdir(directory, { recursive: true });
        return { accepted: true, output: `initialised ${directory}`, command: 'aidlc init' };
      },
    } as unknown as GateControllerPort;
    const scaffold = { writeIntent: async () => true } as unknown as FeatureScaffoldWriterPort;
    const repositories = {
      require: async () => ({ featuresDirectory, label: 'demo', settings: { profile: 'none' } }),
    } as unknown as RepositoryMaintenance;
    const assembler = { invalidate: () => undefined } as unknown as FeatureSnapshotAssembler;

    useCase = new CreateFeatureUseCase(controller, scaffold, repositories, assembler, new FileSystem());
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stamps the directory and hands that name to the controller', async () => {
    const result = await useCase.execute({ repositoryId: 'r1', slug: 'Refund Flow' });

    expect(result.slug).toBe(`${today()}01-refund-flow`);
    expect(result.directory).toBe(path.join(featuresDirectory, `${today()}01-refund-flow`));
    // The controller must be told the stamped name, or its state file's slug and the
    // directory it sits in disagree.
    expect(initialised).toEqual({ directory: result.directory, slug: result.slug });
  });

  it('numbers the day in sequence, and only that day', async () => {
    await fs.mkdir(path.join(featuresDirectory, `${today()}01-first`));
    await fs.mkdir(path.join(featuresDirectory, '2024010109-another-day'));

    const result = await useCase.execute({ repositoryId: 'r1', slug: 'second' });
    expect(result.slug).toBe(`${today()}02-second`);
  });

  it('takes the highest number plus one, not the count', async () => {
    // 01 was deleted. Reusing it would point two histories at one directory name.
    await fs.mkdir(path.join(featuresDirectory, `${today()}02-survivor`));

    const result = await useCase.execute({ repositoryId: 'r1', slug: 'next-one' });
    expect(result.slug).toBe(`${today()}03-next-one`);
  });

  it('refuses a name already taken under any stamp', async () => {
    await fs.mkdir(path.join(featuresDirectory, '2024010103-refund-flow'));

    await expect(useCase.execute({ repositoryId: 'r1', slug: 'refund-flow' })).rejects.toThrow(
      /2024010103-refund-flow already exists/,
    );
  });

  it('refuses a name taken by a directory predating the sequence', async () => {
    await fs.mkdir(path.join(featuresDirectory, '20240101-refund-flow'));

    await expect(useCase.execute({ repositoryId: 'r1', slug: 'refund-flow' })).rejects.toThrow(
      /20240101-refund-flow already exists/,
    );
  });

  it('refuses a name that would not survive being a directory', async () => {
    await expect(useCase.execute({ repositoryId: 'r1', slug: '-nope' })).rejects.toThrow(/not a usable slug/);
  });
});
