import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

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
        found.push({ relativePath, absolutePath });
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
