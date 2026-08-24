export interface InboxItemModel {
  id: string;
  kind: string;
  severity: string;
  repositoryId: string;
  repositoryLabel: string;
  featureSlug: string | null;
  title: string;
  detail: string | null;
  suggestedAction: string | null;
  subjectId: string | null;
  weight: number;
}

export interface InboxModel {
  items: InboxItemModel[];
  counts: Record<string, number>;
  featuresWithoutGateCheck: number;
}

export interface ReadyTicketModel {
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
  unblocks: number;
  onCriticalPath: boolean;
  risk: string;
  gate: string;
}

export interface BoardCardModel {
  ticketId: string;
  title: string;
  status: string;
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
  gate: string;
  lastActivityAt: string | null;
  checkouts: { repositoryId: string; repositoryLabel: string; branch: string | null; status: string }[];
  diverged: boolean;
}

export interface BoardModel {
  cards: BoardCardModel[];
  facets: { property: string; label: string; values: { value: string; label: string; count: number }[] }[];
  totalBeforeFilters: number;
  scopeLabel: string;
}

export interface SearchHitModel {
  kind: string;
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

export interface AuditRowModel {
  repositoryId: string;
  repositoryLabel: string;
  featureSlug: string;
  gate: string;
  action: string;
  at: string | null;
  by: string;
  ticket: string | null;
  reason: string | null;
  evidence: string | null;
  reviewBypass: boolean;
}
