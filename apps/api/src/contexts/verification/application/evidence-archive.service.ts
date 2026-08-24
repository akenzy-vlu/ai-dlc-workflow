import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import {
  EVIDENCE_STORE,
  EvidenceManifest,
  EvidenceStorePort,
  ManifestEntry,
} from '../domain/ports/evidence-store.port';
import type { EvidenceBlobStream } from '../domain/ports/evidence-store.port';

const EVIDENCE_DIR = 'evidence';
export const MANIFEST_FILE = 'evidence-manifest.json';

/** Screenshots and reports only. run.json is the evidence itself and stays in the repo. */
const ARCHIVABLE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf']);

/**
 * Puts a feature's evidence into the content-addressed store and writes a manifest.
 *
 * The manifest is the part that travels. `evidence/*.png` is gitignored and so exists
 * only where the browser ran; `evidence-manifest.json` is small, textual, and meant to be
 * committed — it records which screenshots the evidence claims and the hash of each. A
 * teammate who pulls the repo can then see what evidence exists and, once the bytes reach
 * them by any route, verify they are the bytes that were approved.
 *
 * What this does *not* do is move bytes between machines. That needs a shared backend
 * behind `EvidenceStorePort` — S3 or MinIO — and the choice of one is a deployment
 * decision, not a code one. Archiving locally first is what makes that swap a one-adapter
 * change instead of a redesign.
 */
@Injectable()
export class EvidenceArchiveService {
  private readonly logger = new Logger(EvidenceArchiveService.name);

  constructor(
    @Inject(EVIDENCE_STORE) private readonly store: EvidenceStorePort,
    private readonly repositories: RepositoryMaintenance,
  ) {}

  async archive(repositoryId: string, slug: string): Promise<EvidenceManifest> {
    const repository = await this.repositories.require(repositoryId);
    const featureDirectory = path.join(repository.featuresDirectory, slug);
    const evidenceRoot = path.join(featureDirectory, EVIDENCE_DIR);

    const files = await this.walk(evidenceRoot);
    const blobs: ManifestEntry[] = [];
    for (const absolute of files) {
      if (!ARCHIVABLE.has(path.extname(absolute).toLowerCase())) continue;
      const ref = await this.store.put(absolute);
      blobs.push({ ...ref, path: path.relative(evidenceRoot, absolute).split(path.sep).join('/') });
    }
    blobs.sort((a, b) => a.path.localeCompare(b.path));

    const manifest: EvidenceManifest = {
      version: 1,
      repositoryLabel: repository.label,
      slug,
      capturedAt: new Date().toISOString(),
      blobs,
    };
    await fs.writeFile(
      path.join(featureDirectory, MANIFEST_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf-8',
    );
    this.logger.log(`archived ${blobs.length} evidence file(s) for ${repository.label}/${slug}`);
    return manifest;
  }

  async readManifest(repositoryId: string, slug: string): Promise<EvidenceManifest | null> {
    const repository = await this.repositories.require(repositoryId);
    const target = path.join(repository.featuresDirectory, slug, MANIFEST_FILE);
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(target, 'utf-8'));
      return parsed && typeof parsed === 'object' ? (parsed as EvidenceManifest) : null;
    } catch {
      return null;
    }
  }

  /**
   * A manifest entry whose bytes this machine does not hold is the interesting case: it
   * is evidence someone else produced, named and hashed but not yet transferable here.
   */
  async describe(repositoryId: string, slug: string) {
    const manifest = await this.readManifest(repositoryId, slug);
    if (!manifest) return { manifest: null, present: 0, missing: 0, blobs: [] };
    const blobs = await Promise.all(
      manifest.blobs.map(async (blob) => ({ ...blob, held: await this.store.has(blob.sha256) })),
    );
    return {
      manifest: { ...manifest, blobs: undefined },
      present: blobs.filter((b) => b.held).length,
      missing: blobs.filter((b) => !b.held).length,
      blobs,
    };
  }

  async open(sha256: string): Promise<EvidenceBlobStream> {
    const found = await this.store.open(sha256);
    if (!found) throw new NotFoundException(`no evidence blob ${sha256} in this console's store`);
    return found;
  }

  private async walk(root: string): Promise<string[]> {
    const out: string[] = [];
    const visit = async (directory: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(absolute);
        else if (entry.isFile()) out.push(absolute);
      }
    };
    await visit(root);
    return out.sort();
  }
}
