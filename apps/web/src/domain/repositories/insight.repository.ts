import type { AuditRow, Board, Inbox, ReadyTicket, SearchHit } from '../entities';
import type { InboxSeverity } from '../enums';
import type { ViewFilter } from '../value-objects';
import type { QueryResult } from './query.types';

export interface BoardScope {
  /** `all`, `project:<key>`, `repository:<id>`, or `feature:<repoId>/<slug>`. */
  scope: string;
  filters: ViewFilter[];
  mergeCheckouts: boolean;
}

/** The read side: questions no single plan file answers. */
export interface InsightRepository {
  useInbox(params?: { repositoryId?: string; severity?: InboxSeverity }): QueryResult<Inbox>;
  useReadyQueue(params?: {
    repositoryId?: string;
    layer?: string;
    type?: string;
    maxHours?: number;
  }): QueryResult<ReadyTicket[]>;
  useBoard(scope: BoardScope): QueryResult<Board>;
  useAudit(params?: { repositoryId?: string; slug?: string; limit?: number }): QueryResult<AuditRow[]>;
  /** Skipped below two characters — a one-letter query matches most of a portfolio. */
  useSearch(term: string): QueryResult<SearchHit[]>;
}
