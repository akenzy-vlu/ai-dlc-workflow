import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { NotFoundError, RefusedError } from '../../../shared/kernel';

/**
 * Files that are never part of a skill package.
 *
 * `__pycache__` is the one that matters. Python writes it the first time a controller
 * script runs, so a synced copy grows bytecode the source does not have — and without
 * this every global skill would read as `outdated` forever, one command after being
 * synced. The rest are editor and OS litter with the same effect.
 */
const IGNORED = new Set(['__pycache__', '.DS_Store', '.git', 'node_modules', '.venv', 'venv']);

function ignored(name: string): boolean {
  return IGNORED.has(name) || name.endsWith('.pyc') || name.endsWith('.pyo');
}

export interface PackageFile {
  /** Path relative to the package root, POSIX-separated so digests match across hosts. */
  relativePath: string;
  absolutePath: string;
  /** Byte size, per `fs.stat` — populated for every consumer, not just file-content reads. */
  size: number;
}

/** Lists a package's files, sorted, with the noise above excluded. */
export async function listPackageFiles(packagePath: string): Promise<PackageFile[]> {
  const found: PackageFile[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignored(entry.name)) continue;
      const absolutePath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(absolutePath);
        found.push({ relativePath, absolutePath, size: stat.size });
      }
    }
  }

  await walk(packagePath, '');
  found.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
  return found;
}

/**
 * A digest over the package's *contents*, not its timestamps.
 *
 * Paths are hashed alongside the bytes, so renaming a file changes the digest even when
 * every byte in the package is otherwise identical. Copying does not preserve mtimes
 * faithfully across filesystems, which is why "is this installed copy current?" cannot be
 * answered with stat().
 */
export async function digestPackage(packagePath: string): Promise<string | null> {
  const files = await listPackageFiles(packagePath);
  if (files.length === 0) return null;

  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update('\0');
    hash.update(await fs.readFile(file.absolutePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Bytes read from a file before it is declared truncated. Proposed by A-06. */
const MAX_READ_BYTES = 1_000_000;

export interface ReadPackageFileOptions {
  /** Override for tests; production callers should rely on the default. */
  maxBytes?: number;
}

export interface PackageFileContent {
  relativePath: string;
  content: string | undefined;
  encoding: 'utf8' | 'binary';
  truncated: boolean;
  size: number;
}

/**
 * Reads one file inside a package, by a caller-supplied relative path.
 *
 * The guard runs before any filesystem call: `relativePath` is resolved against the
 * package root, and the result must stay under the resolved root, exactly like
 * `BrowseDirectories.list` refuses a path outside its configured roots. This is what
 * rejects `../` traversal, an absolute-path override (`path.resolve` discards the root
 * entirely when the second argument is itself absolute), and a symlink that resolves
 * outside the root (via `fs.realpath`, which follows symlinks all the way to their final
 * target).
 */
export async function readPackageFile(
  packagePath: string,
  relativePath: string,
  opts: ReadPackageFileOptions = {},
): Promise<PackageFileContent> {
  const root = path.resolve(packagePath);
  // path.resolve (not path.join) is what makes an absolute relativePath an attack rather
  // than a no-op: path.resolve(root, '/etc/passwd') === '/etc/passwd', discarding root
  // entirely, whereas path.join would have nested it harmlessly under root.
  const joined = path.resolve(root, relativePath);
  if (joined !== root && !joined.startsWith(`${root}${path.sep}`)) {
    throw new RefusedError(`refused: ${relativePath} escapes the package root`, {
      packagePath: root,
      relativePath,
    });
  }

  // A symlink inside the root can still point outside it; realpath resolves the final
  // target, so this catches that case the string check above cannot.
  let realTarget: string;
  try {
    realTarget = await fs.realpath(joined);
  } catch (cause) {
    // A file deleted between listing and reading is a 404, not a refusal — the request
    // wasn't malicious, its target just no longer exists. Per the error taxonomy in
    // 03-logical-design.md. Anything else here (an unresolvable symlink loop, a
    // permissions error) stays a RefusedError: those are suspicious, not merely absent.
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError('file', relativePath);
    }
    throw new RefusedError(`refused: cannot resolve ${relativePath} — ${(cause as Error).message}`, {
      packagePath: root,
      relativePath,
    });
  }
  const realRoot = await fs.realpath(root);
  if (realTarget !== realRoot && !realTarget.startsWith(`${realRoot}${path.sep}`)) {
    throw new RefusedError(`refused: ${relativePath} escapes the package root`, {
      packagePath: root,
      relativePath,
    });
  }

  const maxBytes = opts.maxBytes ?? MAX_READ_BYTES;
  const stat = await fs.stat(joined);
  const size = stat.size;
  const truncated = size > maxBytes;

  const handle = await fs.open(joined, 'r');
  let buffer: Buffer;
  try {
    const readLength = truncated ? maxBytes : size;
    buffer = Buffer.alloc(readLength);
    await handle.read(buffer, 0, readLength, 0);
  } finally {
    await handle.close();
  }

  if (isBinary(buffer)) {
    return { relativePath, content: undefined, encoding: 'binary', truncated: false, size };
  }

  // A truncated read can legitimately end mid-character (a multi-byte UTF-8 sequence cut
  // at the cap); that is not evidence of binary content, so decoding here is lenient
  // rather than fatal. A non-truncated read has no excuse for an invalid sequence.
  if (truncated) {
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    return { relativePath, content: decoded, encoding: 'utf8', truncated, size };
  }

  const decoded = decodeUtf8(buffer);
  if (decoded === null) {
    return { relativePath, content: undefined, encoding: 'binary', truncated: false, size };
  }

  return { relativePath, content: decoded, encoding: 'utf8', truncated, size };
}

/** A null byte anywhere in the sample is treated as definitive proof of binary content. */
function isBinary(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 8000);
  for (let i = 0; i < sampleLength; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/** Decodes strictly: any invalid UTF-8 sequence fails rather than silently substituting. */
function decodeUtf8(buffer: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}
