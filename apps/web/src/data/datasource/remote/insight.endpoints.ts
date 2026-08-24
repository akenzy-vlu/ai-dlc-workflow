import type { AuditRow, Board, Inbox, ReadyTicket, SearchHit } from '@domain/entities';
import type { InboxSeverity } from '@domain/enums';
import type { ViewFilter } from '@domain/value-objects';
import type { AuditRowModel, BoardModel, InboxModel, ReadyTicketModel, SearchHitModel } from '../../models';
import { toAuditRow, toBoard, toInbox, toReadyTicket, toSearchHit } from '../../mappers';
import { consoleApi } from './api';

const queryString = (params: Record<string, unknown>): string => {
  const search = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return search ? `?${search}` : '';
};

export const insightEndpoints = consoleApi.injectEndpoints({
  endpoints: (build) => ({
    getInbox: build.query<Inbox, { repositoryId?: string; severity?: InboxSeverity } | void>({
      query: (params) => `/inbox${queryString(params ?? {})}`,
      transformResponse: (model: InboxModel) => toInbox(model),
      providesTags: ['Inbox'],
    }),

    getReadyQueue: build.query<
      ReadyTicket[],
      { repositoryId?: string; layer?: string; type?: string; maxHours?: number } | void
    >({
      query: (params) => `/ready-queue${queryString(params ?? {})}`,
      transformResponse: (models: ReadyTicketModel[]) => models.map(toReadyTicket),
      providesTags: ['ReadyQueue'],
    }),

    getBoard: build.query<Board, { scope: string; filters: ViewFilter[]; mergeCheckouts: boolean }>({
      // A POST because a filter is a triple and encoding a list of them as flat query
      // params reintroduces exactly the AND/OR ambiguity the filter model settles.
      query: (body) => ({ url: '/board', method: 'POST', body }),
      transformResponse: (model: BoardModel) => toBoard(model),
      providesTags: ['Board'],
    }),

    getAudit: build.query<AuditRow[], { repositoryId?: string; slug?: string; limit?: number } | void>({
      query: (params) => `/audit${queryString(params ?? {})}`,
      transformResponse: (models: AuditRowModel[]) => models.map(toAuditRow),
      providesTags: ['Audit'],
    }),

    search: build.query<SearchHit[], { term: string; limit?: number }>({
      query: ({ term, limit = 30 }) => `/search?q=${encodeURIComponent(term)}&limit=${limit}`,
      transformResponse: (models: SearchHitModel[]) => models.map(toSearchHit),
      // Results are a projection of everything; a plan edit changes them, so they follow
      // the portfolio tag rather than carrying one of their own.
      providesTags: ['Portfolio'],
    }),
  }),
});

export const {
  useGetInboxQuery,
  useGetReadyQueueQuery,
  useGetBoardQuery,
  useGetAuditQuery,
  useSearchQuery,
} = insightEndpoints;
