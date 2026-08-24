import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { CasEvidenceStore, contentTypeFor } from '../src/contexts/verification/infrastructure/cas-evidence.store';
import type { AidlcConfig } from '../src/config/aidlc.config';

/**
 * The only spec in this suite that touches disk, deliberately: the property under test —
 * that identical bytes are stored exactly once — is a property of the filesystem layout,
 * and a mocked fs would assert the mock rather than the store. It runs in a temp
 * directory and removes it afterwards.
 */
describe('content-addressed evidence store', () => {
  let home: string;
  let store: CasEvidenceStore;
  let source: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'aidlc-cas-'));
    source = path.join(home, 'src');
    await fs.mkdir(source, { recursive: true });
    store = new CasEvidenceStore({ consoleHome: home } as AidlcConfig);
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  const write = async (name: string, body: string): Promise<string> => {
    const target = path.join(source, name);
    await fs.writeFile(target, body);
    return target;
  };

  it('names a blob by its own sha256 and reports its type', async () => {
    const file = await write('step-01.png', 'pretend-png-bytes');
    const ref = await store.put(file);
    expect(ref.sha256).toBe(createHash('sha256').update('pretend-png-bytes').digest('hex'));
    expect(ref.contentType).toBe('image/png');
    expect(ref.bytes).toBe('pretend-png-bytes'.length);
  });

  it('stores identical bytes once, however many runs produced them', async () => {
    // A screenshot of a screen that did not change is byte-identical between runs; this
    // is where content addressing pays for itself.
    const first = await write('local-desktop.png', 'same-pixels');
    const second = await write('staging-desktop.png', 'same-pixels');
    const a = await store.put(first);
    const b = await store.put(second);
    expect(a.sha256).toBe(b.sha256);
    expect((await store.stats()).blobs).toBe(1);
  });

  it('distinguishes different bytes', async () => {
    await store.put(await write('a.png', 'one'));
    await store.put(await write('b.png', 'two'));
    expect((await store.stats()).blobs).toBe(2);
  });

  it('finds a stored blob and reports nothing for one it never held', async () => {
    const ref = await store.put(await write('x.png', 'bytes'));
    expect(await store.has(ref.sha256)).toBe(true);
    expect(await store.has('f'.repeat(64))).toBe(false);
    expect(await store.open('f'.repeat(64))).toBeNull();
  });

  it('opens a stored blob as a stream carrying its own bytes and type', async () => {
    const ref = await store.put(await write('x.png', 'bytes'));
    const blob = await store.open(ref.sha256);

    expect(blob).not.toBeNull();
    expect(blob!.contentType).toBe('image/png');
    expect(blob!.bytes).toBe(5);

    const chunks: Buffer[] = [];
    for await (const chunk of blob!.body) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('bytes');
  });

  it('refuses an id that is not a hash, so a URL cannot walk out of the store', async () => {
    for (const attempt of ['../../etc/passwd', 'ab/../..', 'NOTHEX'.repeat(10), '', 'a'.repeat(63)]) {
      expect(await store.has(attempt)).toBe(false);
      expect(await store.open(attempt)).toBeNull();
    }
  });

  it('falls back to a neutral content type rather than guessing', () => {
    expect(contentTypeFor('shot.PNG')).toBe('image/png');
    expect(contentTypeFor('report.pdf')).toBe('application/pdf');
    expect(contentTypeFor('trace.zip')).toBe('application/octet-stream');
  });

  it('reports an empty store instead of failing before anything is archived', async () => {
    expect(await store.stats()).toEqual({ blobs: 0, bytes: 0 });
  });
});
