import type { Readable } from 'node:stream';

export const EVIDENCE_STORE = Symbol('EVIDENCE_STORE');

export interface EvidenceBlobRef {
  sha256: string;
  bytes: number;
  contentType: string;
}

export interface ManifestEntry extends EvidenceBlobRef {
  /** Path relative to the feature's `evidence/` directory, as `run.json` names it. */
  path: string;
}

export interface EvidenceManifest {
  version: 1;
  repositoryLabel: string;
  slug: string;
  capturedAt: string;
  blobs: ManifestEntry[];
}

/**
 * Where evidence screenshots live once they stop being one machine's local files.
 *
 * `evidence/*.png` is gitignored — correctly, it is generated and binary — with the
 * consequence that a screenshot exists only on the machine that ran the browser. For one
 * person that is invisible; for a team it means the evidence a gate depends on cannot be
 * looked at by anyone reviewing it.
 *
 * Content addressing is what makes the fix cheap: the same screenshot of an unchanged
 * screen is byte-identical across runs, so storing by hash deduplicates for free, and the
 * hash in a committed manifest lets anyone verify that the bytes they were handed are the
 * bytes the evidence claimed — regardless of how they travelled.
 *
 * `locate` returns a local path because the caller streams a file. A remote adapter
 * (S3, MinIO) implements it by materialising the object into a local cache first, the
 * way git-lfs does; that keeps this port honest for both.
 */
/** An open blob, ready to stream to a client. */
export interface EvidenceBlobStream extends EvidenceBlobRef {
  body: Readable;
}

export interface EvidenceStorePort {
  put(absolutePath: string): Promise<EvidenceBlobRef>;
  /** Cheap existence check — never transfers the body. */
  has(sha256: string): Promise<boolean>;
  /**
   * Opens a blob for streaming, or null when it is not held.
   *
   * A stream rather than a path: an object store has no local path to hand back, and the
   * previous signature quietly assumed every backend was a filesystem.
   */
  open(sha256: string): Promise<EvidenceBlobStream | null>;
  /** Total blobs and bytes held, for the diagnostics panel. */
  stats(): Promise<{ blobs: number; bytes: number }>;
}
