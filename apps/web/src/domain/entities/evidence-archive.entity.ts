/**
 * Screenshots copied into a content-addressed store.
 *
 * Kept as its own entity rather than folded into `Verification`: an archive outlives the
 * run that produced it, and a blob is addressed by hash, not by the path it happened to
 * have inside one feature's `evidence/` directory.
 */
export interface EvidenceBlob {
  path: string;
  sha256: string;
  bytes: number;
  contentType: string;
  /** False when the manifest names a blob the store no longer holds. */
  held: boolean;
}

export interface EvidenceManifest {
  version: 1;
  repositoryLabel: string;
  slug: string;
  capturedAt: string;
  blobs: { path: string; sha256: string; bytes: number; contentType: string }[];
}

export interface EvidenceArchive {
  manifest: Omit<EvidenceManifest, 'blobs'> | null;
  present: number;
  missing: number;
  blobs: EvidenceBlob[];
}
