import type { InboxItem, Repository } from '@domain/entities';
import type { InboxKind, InboxSeverity } from '@domain/enums';

export type SeverityTab = InboxSeverity | 'all';

export interface InboxPageViewProps {
  loading: boolean;
  fetching: boolean;
  severity: SeverityTab;
  counts: Record<SeverityTab, number>;
  /** Items already filtered by the active tab, bucketed by kind. */
  grouped: [InboxKind, InboxItem[]][];
  repositories: Repository[];
  repositoryId: string | undefined;
  featuresWithoutGateCheck: number;
  sweeping: boolean;
  onSeverityChange: (severity: SeverityTab) => void;
  onRepositoryChange: (repositoryId: string | undefined) => void;
  onRefresh: () => void;
  onSweep: () => void;
}
