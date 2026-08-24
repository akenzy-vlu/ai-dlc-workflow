import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/** Thin, testable filesystem surface. Read-only helpers plus a guarded existence check. */
export class FileSystem {
  async readText(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  async exists(target: string): Promise<boolean> {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

  async isDirectory(target: string): Promise<boolean> {
    try {
      return (await fs.stat(target)).isDirectory();
    } catch {
      return false;
    }
  }

  async listDirectories(parent: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(parent, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  async listFiles(parent: string, extension?: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(parent, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .filter((n) => !extension || n.endsWith(extension))
        .sort();
    } catch {
      return [];
    }
  }

  async modifiedAt(target: string): Promise<Date | null> {
    try {
      return (await fs.stat(target)).mtime;
    } catch {
      return null;
    }
  }

  async writeJson(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  async readJson<T>(filePath: string): Promise<T | null> {
    const text = await this.readText(filePath);
    if (text === null) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
}
