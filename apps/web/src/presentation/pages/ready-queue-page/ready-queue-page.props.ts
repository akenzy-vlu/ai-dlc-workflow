import type { ReadyTicket, Repository } from '@domain/entities';

export interface ReadyQueueFilters {
  repositoryId?: string;
  layer?: string;
  type?: string;
  maxHours?: number | null;
}

export interface ReadyQueuePageViewProps {
  rows: ReadyTicket[];
  loading: boolean;
  fetching: boolean;
  repositories: Repository[];
  layers: string[];
  types: string[];
  filters: ReadyQueueFilters;
  totalHours: number;
  onFilterChange: (patch: Partial<ReadyQueueFilters>) => void;
  onRefresh: () => void;
}
