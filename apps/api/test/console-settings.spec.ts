import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { AidlcConfig } from '../src/config/aidlc.config';
import { FileSystem } from '../src/shared/infrastructure/fs/file-system';
import { FileConsoleSettings } from '../src/shared/settings/file-console-settings';

describe('file console settings', () => {
  let home: string;
  let settings: FileConsoleSettings;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'aidlc-settings-'));
    settings = new FileConsoleSettings({ consoleHome: home } as AidlcConfig, new FileSystem());
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('reads an empty object when nothing has been written yet', async () => {
    expect(await settings.read()).toEqual({});
  });

  it('merges a patch over what is stored rather than replacing it', async () => {
    // The interpreter is written by setup; anything else on the document has to survive.
    await fs.writeFile(path.join(home, 'settings.json'), JSON.stringify({ keep: 'me' }));
    await settings.patch({ runnerPython: '/venv/bin/python' });

    expect(await settings.read()).toEqual({ keep: 'me', runnerPython: '/venv/bin/python' });
  });

  it('round-trips through disk, not through memory', async () => {
    await settings.patch({ runnerPython: '/a' });
    const fresh = new FileConsoleSettings({ consoleHome: home } as AidlcConfig, new FileSystem());
    expect((await fresh.read()).runnerPython).toBe('/a');
  });
});
