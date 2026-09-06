import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { NotFoundError, RefusedError } from '../src/shared/kernel';
import { listPackageFiles, readPackageFile } from '../src/contexts/skills/infrastructure/skill-digest';

/**
 * Touches disk on purpose, like skill-installer.spec.ts: the properties under test — that
 * a traversal attempt never reaches the filesystem, that truncation and binary detection
 * behave as documented — are properties of real files and real paths, not of a mock.
 */
describe('readPackageFile', () => {
  let root: string;
  let pkg: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aidlc-skill-files-'));
    pkg = path.join(root, 'package');
    await fs.mkdir(pkg, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('reads a normal text file back byte-for-byte', async () => {
    await fs.writeFile(path.join(pkg, 'SKILL.md'), '# hello\n\nsome content\n');

    const result = await readPackageFile(pkg, 'SKILL.md');

    expect(result).toEqual({
      relativePath: 'SKILL.md',
      content: '# hello\n\nsome content\n',
      encoding: 'utf8',
      truncated: false,
      size: Buffer.byteLength('# hello\n\nsome content\n'),
    });
  });

  it('reads a file nested under subdirectories', async () => {
    await fs.mkdir(path.join(pkg, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(pkg, 'scripts', 'aidlc.py'), 'print("hi")\n');

    const result = await readPackageFile(pkg, 'scripts/aidlc.py');

    expect(result.content).toBe('print("hi")\n');
    expect(result.encoding).toBe('utf8');
  });

  it('refuses a relativePath that escapes the package root with ../ segments, before touching the filesystem', async () => {
    // Nothing under root has this name; if the guard read the filesystem before checking
    // containment, this would surface as ENOENT rather than a RefusedError.
    await expect(readPackageFile(pkg, '../outside.txt')).rejects.toThrow(RefusedError);
    await expect(readPackageFile(pkg, '../../etc/passwd')).rejects.toThrow(RefusedError);
  });

  it('refuses an absolute-path override the same way', async () => {
    // path.resolve(root, '/etc/passwd') discards root entirely and returns '/etc/passwd' —
    // this is the exact escape the guard exists to catch.
    await expect(readPackageFile(pkg, '/etc/passwd')).rejects.toThrow(RefusedError);
  });

  it('refuses a symlink that resolves outside the package root', async () => {
    const outside = path.join(root, 'secret.txt');
    await fs.writeFile(outside, 'top secret');
    await fs.symlink(outside, path.join(pkg, 'link.txt'));

    await expect(readPackageFile(pkg, 'link.txt')).rejects.toThrow(RefusedError);
  });

  it('returns truncated: true with partial content for a file over the size cap', async () => {
    const big = 'a'.repeat(2000);
    await fs.writeFile(path.join(pkg, 'big.txt'), big);

    const result = await readPackageFile(pkg, 'big.txt', { maxBytes: 1000 });

    expect(result.truncated).toBe(true);
    expect(result.content).toHaveLength(1000);
    expect(result.size).toBe(2000);
    expect(result.encoding).toBe('utf8');
  });

  it('does not treat a truncated read as binary just because it cuts a multibyte character', async () => {
    // é is two UTF-8 bytes; a cap that lands mid-character must not be misreported as binary.
    const content = 'a'.repeat(9) + 'é'.repeat(50);
    await fs.writeFile(path.join(pkg, 'multibyte.txt'), content, 'utf8');

    const result = await readPackageFile(pkg, 'multibyte.txt', { maxBytes: 10 });

    expect(result.truncated).toBe(true);
    expect(result.encoding).toBe('utf8');
    expect(result.content).toBeDefined();
  });

  it('returns encoding: binary with no content for a non-text file', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10, 0x20, 0x00, 0x30]);
    await fs.writeFile(path.join(pkg, 'image.bin'), bytes);

    const result = await readPackageFile(pkg, 'image.bin');

    expect(result.encoding).toBe('binary');
    expect(result.content).toBeUndefined();
  });

  it('reports the exact byte size of the file regardless of encoding', async () => {
    const bytes = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    await fs.writeFile(path.join(pkg, 'small.bin'), bytes);

    const result = await readPackageFile(pkg, 'small.bin');

    expect(result.size).toBe(4);
    expect(result.truncated).toBe(false);
  });

  it('throws NotFoundError, not RefusedError, for a path that resolves inside the root but does not exist', async () => {
    // Distinguishes "deleted between list and read" (404, per the error taxonomy in
    // 03-logical-design.md) from an actual escape attempt (409/400) — both hit the
    // same fs.realpath call, but for different reasons.
    await expect(readPackageFile(pkg, 'gone.md')).rejects.toThrow(NotFoundError);
  });
});

describe('listPackageFiles ignores the same noise for the file-reading consumer', () => {
  let root: string;
  let pkg: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aidlc-skill-files-ignored-'));
    pkg = path.join(root, 'package');
    await fs.mkdir(path.join(pkg, '__pycache__'), { recursive: true });
    await fs.mkdir(path.join(pkg, 'node_modules'), { recursive: true });
    await fs.mkdir(path.join(pkg, '.git'), { recursive: true });
    await fs.mkdir(path.join(pkg, '.venv'), { recursive: true });
    await fs.mkdir(path.join(pkg, 'venv'), { recursive: true });
    await fs.mkdir(path.join(pkg, 'scripts'), { recursive: true });

    await fs.writeFile(path.join(pkg, 'SKILL.md'), '---\nname: sample\n---\n');
    await fs.writeFile(path.join(pkg, 'scripts', 'aidlc.py'), 'print("hi")\n');
    await fs.writeFile(path.join(pkg, 'scripts', 'aidlc.cpython-314.pyc'), 'bytecode');
    await fs.writeFile(path.join(pkg, 'scripts', 'aidlc.pyo'), 'bytecode');
    await fs.writeFile(path.join(pkg, '__pycache__', 'aidlc.cpython-314.pyc'), 'bytecode');
    await fs.writeFile(path.join(pkg, 'node_modules', 'noise.js'), 'noise');
    await fs.writeFile(path.join(pkg, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await fs.writeFile(path.join(pkg, '.venv', 'pyvenv.cfg'), '');
    await fs.writeFile(path.join(pkg, 'venv', 'pyvenv.cfg'), '');
    await fs.writeFile(path.join(pkg, '.DS_Store'), 'finder');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('excludes every IGNORED entry from the listing this feature reads from', async () => {
    const files = await listPackageFiles(pkg);
    const relativePaths = files.map((f) => f.relativePath);

    expect(relativePaths).toEqual(['SKILL.md', 'scripts/aidlc.py']);
    expect(relativePaths.some((p) => p.includes('__pycache__'))).toBe(false);
    expect(relativePaths.some((p) => p.includes('node_modules'))).toBe(false);
    expect(relativePaths.some((p) => p.includes('.git'))).toBe(false);
    expect(relativePaths.some((p) => p.endsWith('.pyc') || p.endsWith('.pyo'))).toBe(false);
    expect(relativePaths.some((p) => p.includes('.DS_Store'))).toBe(false);
  });

  it('every file listPackageFiles surfaces is readable through readPackageFile', async () => {
    const files = await listPackageFiles(pkg);
    for (const file of files) {
      const result = await readPackageFile(pkg, file.relativePath);
      expect(result.encoding).toBe('utf8');
    }
  });
});
