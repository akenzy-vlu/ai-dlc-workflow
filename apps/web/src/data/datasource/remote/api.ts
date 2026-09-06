import { createApi, fetchBaseQuery, type FetchBaseQueryError } from '@reduxjs/toolkit/query/react';

/**
 * Cache tags, one per read model the API exposes.
 *
 * A write invalidates the tags it could plausibly have touched, and no more. Being
 * generous here is tempting and expensive: invalidating `Portfolio` on every ticket
 * transition would re-read two thousand plan files to update one badge.
 */
export const API_TAGS = [
  'Repository',
  'Project',
  'Portfolio',
  'Inbox',
  'ReadyQueue',
  'Board',
  'Feature',
  'Audit',
  'Agent',
  'AgentRun',
  'Verification',
  'EvidenceArchive',
  'Runner',
  'Tooling',
  'Skill',
  'SkillFile',
] as const;

/**
 * Turns a fetch failure into the sentence the API meant to say.
 *
 * The server's errors are frequently the *controller's* errors passed through verbatim —
 * "refused: T-01-02 has 1 unticked done-when item(s)" — and those name the file to go and
 * fix. Replacing them with "Request failed" throws away the only useful part.
 */
export function describeError(error: unknown): string | null {
  if (!error) return null;

  const fetchError = error as FetchBaseQueryError;
  if (typeof fetchError === 'object' && 'status' in fetchError) {
    const body = fetchError.data as { message?: string | string[]; code?: string } | undefined;
    if (body?.message) {
      return Array.isArray(body.message) ? body.message.join('; ') : body.message;
    }
    if (fetchError.status === 'FETCH_ERROR') {
      return 'The console API is not reachable — is it running on port 7777?';
    }
    return `Request failed (${String(fetchError.status)})`;
  }

  return (error as Error).message ?? 'Unexpected error';
}

/**
 * The single RTK Query slice. Endpoints are injected per context from sibling files, so
 * one context's endpoints can be read without scrolling past five others.
 */
export const consoleApi = createApi({
  reducerPath: 'consoleApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: API_TAGS,
  // The filesystem watcher pushes invalidations over the socket, so polling on focus
  // would only duplicate work the server already told us about.
  refetchOnFocus: false,
  refetchOnReconnect: true,
  keepUnusedDataFor: 120,
  endpoints: () => ({}),
});
