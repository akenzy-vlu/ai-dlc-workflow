import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { Postgres } from '../../../shared/infrastructure/db/postgres';
import {
  EvidenceBlobRef,
  EvidenceBlobStream,
  EvidenceStorePort,
} from '../domain/ports/evidence-store.port';
import { contentTypeFor } from './cas-evidence.store';

/**
 * Evidence blobs in MinIO, keyed by content hash exactly as the on-disk CAS was.
 *
 * The two properties that mattered on disk still hold and are the reason the object name
 * is the hash: writing the same screenshot twice is a no-op, and a blob is immutable so
 * it can be cached for a year and never invalidated.
 *
 * Metadata is mirrored into Postgres. It could be derived by listing the bucket, but
 * `stats()` runs on the diagnostics panel and listing every object to count them is a
 * request that gets slower for the rest of the console's life.
 */
@Injectable()
export class MinioEvidenceStore implements EvidenceStorePort, OnModuleInit {
  private readonly logger = new Logger(MinioEvidenceStore.name);
  private readonly client: import('minio').Client;
  private readonly bucket: string;

  constructor(
    @Inject(AIDLC_CONFIG) config: AidlcConfig,
    private readonly db: Postgres,
  ) {
    // Required lazily so the file driver never pays for loading the SDK.
    const { Client } = require('minio') as typeof import('minio');
    this.client = new Client({
      endPoint: config.objectStore.endPoint,
      port: config.objectStore.port,
      useSSL: config.objectStore.useSSL,
      accessKey: config.objectStore.accessKey,
      secretKey: config.objectStore.secretKey,
      region: config.objectStore.region,
    });
    this.bucket = config.objectStore.bucket;
  }

  async onModuleInit(): Promise<void> {
    try {
      if (!(await this.client.bucketExists(this.bucket))) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`created bucket ${this.bucket}`);
      }
    } catch (error) {
      // Evidence is an optional surface; a missing bucket must not stop the console from
      // booting and serving plans.
      this.logger.error(`object store unavailable: ${(error as Error).message}`);
    }
  }

  async put(absolutePath: string): Promise<EvidenceBlobRef> {
    const bytes = await fs.readFile(absolutePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const contentType = contentTypeFor(absolutePath);
    const ref: EvidenceBlobRef = { sha256, bytes: bytes.length, contentType };

    if (await this.has(sha256)) return ref; // identical by definition

    await this.client.putObject(this.bucket, this.keyFor(sha256), bytes, bytes.length, {
      'Content-Type': contentType,
    });
    await this.db.query(
      `INSERT INTO evidence_blob (sha256, bytes, content_type) VALUES ($1, $2, $3)
       ON CONFLICT (sha256) DO NOTHING`,
      [sha256, bytes.length, contentType],
    );
    return ref;
  }

  async has(sha256: string): Promise<boolean> {
    if (!isHash(sha256)) return false;
    return (await this.db.one('SELECT 1 FROM evidence_blob WHERE sha256 = $1', [sha256])) !== null;
  }

  async open(sha256: string): Promise<EvidenceBlobStream | null> {
    // The id arrives off a URL; anything but hex could otherwise address another key.
    if (!isHash(sha256)) return null;
    const row = await this.db.one<{ bytes: string; content_type: string }>(
      'SELECT bytes, content_type FROM evidence_blob WHERE sha256 = $1',
      [sha256],
    );
    if (!row) return null;

    try {
      const body = await this.client.getObject(this.bucket, this.keyFor(sha256));
      return { sha256, bytes: Number(row.bytes), contentType: row.content_type, body };
    } catch (error) {
      // Metadata without an object means the bucket was emptied underneath us. Report it
      // as missing rather than as a 500: re-archiving from the checkouts restores it.
      this.logger.warn(`blob ${sha256} in the index but not the bucket: ${(error as Error).message}`);
      return null;
    }
  }

  async stats(): Promise<{ blobs: number; bytes: number }> {
    const row = await this.db.one<{ blobs: string; bytes: string | null }>(
      'SELECT count(*)::text AS blobs, coalesce(sum(bytes), 0)::text AS bytes FROM evidence_blob',
    );
    return { blobs: Number(row?.blobs ?? 0), bytes: Number(row?.bytes ?? 0) };
  }

  /** Sharded like the on-disk CAS was, so a bucket listing stays browsable by hand. */
  private keyFor(sha256: string): string {
    return `${sha256.slice(0, 2)}/${sha256}`;
  }
}

function isHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
