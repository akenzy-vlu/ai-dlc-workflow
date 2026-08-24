import { skipToken } from '@reduxjs/toolkit/query/react';

import type { InsightRepository } from '@domain/repositories';
import {
  useGetAuditQuery,
  useGetBoardQuery,
  useGetInboxQuery,
  useGetReadyQueueQuery,
  useSearchQuery,
} from '../datasource/remote';
import { adaptQuery } from './adapt';

/** Below two characters a query matches most of a portfolio, so it is not sent at all. */
const MIN_SEARCH_LENGTH = 2;

export const insightRepository: InsightRepository = {
  useInbox: (params) => adaptQuery(useGetInboxQuery(params ?? {})),
  useReadyQueue: (params) => adaptQuery(useGetReadyQueueQuery(params ?? {})),
  useBoard: (scope) => adaptQuery(useGetBoardQuery(scope)),
  useAudit: (params) => adaptQuery(useGetAuditQuery(params ?? {})),
  useSearch: (term) => {
    const trimmed = term.trim();
    return adaptQuery(useSearchQuery(trimmed.length >= MIN_SEARCH_LENGTH ? { term: trimmed } : skipToken));
  },
};
