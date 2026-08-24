import type { GateValue, InboxKind, InboxSeverity, SearchKind, WorkStatus } from '../enums';
import type { Facet } from '../value-objects';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  severity: InboxSeverity;
  repositoryId: string;
  repositoryLabel: string;
  featureSlug: string | null;
  /** What is true. One line, no advice. */
  title: string;
  detail: string | null;
  /** The concrete next move, when there is exactly one. */
  suggestedAction: string | null;
  subjectId: string | null;
  weight: number;
}

export interface Inbox {
  items: InboxItem[];
  counts: Record<string, number>;
  /** Features whose next gate has never been checked, so `gate_ready` cannot be known. */
  featuresWithoutGateCheck: number;
}

export interface ReadyTicket {
  repositoryId: string;
  repositoryLabel: string;
  featureSlug: string;
  ticketId: string;
  uowId: string | null;
  uowTitle: string | null;
  title: string;
  layer: string;
  layerDeclared: boolean;
  type: string;
  estimateHours: number;
  estimateLabel: string;
  verifies: string[];
  touches: string[];
  /** How many tickets this one unblocks. The lever worth sorting by. */
  unblocks: number;
  onCriticalPath: boolean;
  risk: string;
  gate: GateValue;
}

/** One checkout's view of a ticket that exists in several checkouts of a project. */
export interface CardCheckout {
  repositoryId: string;
  repositoryLabel: string;
  branch: string | null;
  status: WorkStatus;
}

export interface BoardCard {
  ticketId: string;
  title: string;
  status: WorkStatus;
  layer: string;
  layerDeclared: boolean;
  type: string;
  estimateHours: number;
  estimateLabel: string;
  uowId: string | null;
  uowTitle: string | null;
  risk: string;
  ready: boolean;
  onCriticalPath: boolean;
  unmetDependencies: number;
  untickedCount: number;
  verifies: string[];
  projectKey: string;
  projectLabel: string;
  repositoryId: string;
  repositoryLabel: string;
  branch: string | null;
  featureSlug: string;
  gate: GateValue;
  lastActivityAt: string | null;
  checkouts: CardCheckout[];
  /** True when those checkouts disagree about the ticket's status. */
  diverged: boolean;
}

export interface Board {
  cards: BoardCard[];
  facets: Facet[];
  /** Rows before filters, so the UI can say "42 of 310". */
  totalBeforeFilters: number;
  scopeLabel: string;
}

export interface SearchHit {
  kind: SearchKind;
  /** Where selecting it navigates to. */
  path: string;
  title: string;
  subtitle: string;
  badge: string | null;
  repositoryId: string;
  repositoryLabel: string;
  featureSlug: string | null;
  status: string | null;
  score: number;
}

export interface AuditRow {
  repositoryId: string;
  repositoryLabel: string;
  featureSlug: string;
  gate: GateValue;
  action: string;
  at: string | null;
  by: string;
  ticket: string | null;
  reason: string | null;
  evidence: string | null;
  /** Review was skipped with --no-review. Recorded rather than concealed. */
  reviewBypass: boolean;
}
