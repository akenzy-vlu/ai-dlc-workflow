import type { EvidenceArchive, EvidenceBlob } from '@domain/entities';
import type { FeatureRef } from '@domain/value-objects';

export interface EvidenceArchivePanelProps extends FeatureRef {
  /** When the last run finished, so a manifest older than it can be called stale. */
  lastRunFinishedAt: string | null;
  /** False when there is nothing on disk to archive yet. */
  hasRun: boolean;
}

export interface EvidenceArchivePanelViewProps {
  archive: EvidenceArchive | undefined;
  loading: boolean;
  archiving: boolean;
  hasRun: boolean;
  /** The manifest describes an older run than the one currently in `evidence/`. */
  stale: boolean;
  capturedAtLabel: string;
  totalBytes: number;
  blobUrl: (sha256: string) => string;
  onArchive: () => void;
  preview: EvidenceBlob | null;
  onPreview: (blob: EvidenceBlob | null) => void;
}
