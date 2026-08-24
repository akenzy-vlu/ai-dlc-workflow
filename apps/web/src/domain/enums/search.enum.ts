export const SEARCH_KINDS = [
  'repository',
  'feature',
  'unit-of-work',
  'ticket',
  'criterion',
  'assumption',
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  repository: 'Repository',
  feature: 'Feature',
  'unit-of-work': 'Slice',
  ticket: 'Ticket',
  criterion: 'Criterion',
  assumption: 'Assumption',
};
