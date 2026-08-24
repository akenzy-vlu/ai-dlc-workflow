import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import {
  EvidenceBlobRef,
  EvidenceBlobStream,
  EvidenceStorePort,
} from '../domain/ports/evidence-store.port';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.html': 'text/html',
};

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * A content-addressed store on local disk: `<consoleHome>/evidence-cas/ab/abcd….png`.
 *
 * Two properties matter more than the storage medium. A blob is named by its own hash, so
 * writing the same screenshot twice is a no-op rather than a second copy; and a blob is
 * immutable, so it can be cached hard and never invalidated.
 *
 * This is console state and therefore disposable: delete the directory, re-archive from
 * the checkouts that still have the files, and the result is identical.
 */
@Injectable()
export class CasEvidenceStore implements EvidenceStorePort {
  private readonly logger = new Logger(CasEvidenceStore.name);
  private readonly root: string;

  constructor(@Inject(AIDLC_CONFIG) config: AidlcConfig) {
    this.root = path.join(config.consoleHome, 'evidence-cas');
  }

  async put(absolutePath: string): Promise<EvidenceBlobRef> {
    const bytes = await fs.readFile(absolutePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const contentType = contentTypeFor(absolutePath);
    const target = this.pathFor(sha256, path.extname(absolutePath).toLowerCase());

    try {
      await fs.access(target);
      return { sha256, bytes: bytes.length, contentType }; // already held; identical by definition
    } catch {
      // not stored yet
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write to a sibling temp file and rename: a reader must never see a partial blob
    // under a name that promises a specific hash.
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, bytes);
    await fs.rename(temp, target);
    return { sha256, bytes: bytes.length, contentType };
  }

  async has(sha256: string): Promise<boolean> {
    return (await this.locate(sha256)) !== null;
  }

  async open(sha256: string): Promise<EvidenceBlobStream | null> {
    const absolute = await this.locate(sha256);
    if (!absolute) return null;
    const stat = await fs.stat(absolute);
    return {
      sha256,
      bytes: stat.size,
      contentType: contentTypeFor(absolute),
      body: createReadStream(absolute),
    };
  }

  /** Still a path internally — this adapter *is* a filesystem. */
  private async locate(sha256: string): Promise<string | null> {
    // The id comes off a URL; anything but hex could otherwise walk out of the store.
    if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
    const directory = path.join(this.root, sha256.slice(0, 2));
    let names: string[];
    try {
      names = await fs.readdir(directory);
    } catch {
      return null;
    }
    const match = names.find((name) => name.startsWith(sha256) && !name.endsWith('.tmp'));
    return match ? path.join(directory, match) : null;
  }

  async stats(): Promise<{ blobs: number; bytes: number }> {
    let blobs = 0;
    let bytes = 0;
    let shards: string[];
    try {
      shards = await fs.readdir(this.root);
    } catch {
      return { blobs, bytes };
    }
    for (const shard of shards) {
      let names: string[];
      try {
        names = await fs.readdir(path.join(this.root, shard));
      } catch {
        continue;
      }
      for (const name of names) {
        if (name.endsWith('.tmp')) continue;
        const stat = await fs.stat(path.join(this.root, shard, name)).catch(() => null);
        if (!stat) continue;
        blobs += 1;
        bytes += stat.size;
      }
    }
    return { blobs, bytes };
  }

  private pathFor(sha256: string, extension: string): string {
    return path.join(this.root, sha256.slice(0, 2), `${sha256}${extension}`);
  }
}
