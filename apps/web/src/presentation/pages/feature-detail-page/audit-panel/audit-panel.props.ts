import type { AuditEntry } from '@domain/entities';

export interface AuditPanelProps {
  history: AuditEntry[];
}

export interface AuditPanelViewProps {
  /** Newest first — the interesting end of a sixty-entry trail. */
  entries: AuditEntry[];
}
