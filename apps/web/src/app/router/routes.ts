/** Every route the shell can reach, named once so nav and navigation cannot drift apart. */
export const ROUTES = {
  inbox: '/inbox',
  readyQueue: '/ready',
  board: '/board',
  portfolio: '/portfolio',
  agentRuns: '/agent-runs',
  audit: '/audit',
  repositories: '/repositories',
  skills: '/skills',
  setup: '/setup',
  feature: (repositoryId: string, slug: string) =>
    `/features/${encodeURIComponent(repositoryId)}/${encodeURIComponent(slug)}`,
} as const;
