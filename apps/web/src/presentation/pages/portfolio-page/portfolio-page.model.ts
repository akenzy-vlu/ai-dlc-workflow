import type { FeatureSummary } from '@domain/entities';
import type { DisplayOptions, DisplaySchema } from '@domain/value-objects';

export const PORTFOLIO_VIEW_KEY = 'portfolio';

export const PORTFOLIO_DEFAULTS: DisplayOptions = {
  groupBy: 'none',
  orderBy: 'slug',
  properties: ['branch', 'ready', 'review', 'critical', 'remaining', 'blocked', 'coverage', 'activity'],
  showEmptyGroups: false,
  hideCompleted: false,
  mergeCheckouts: true,
};

export const PORTFOLIO_SCHEMA: DisplaySchema = {
  groupBy: [
    { value: 'none', label: 'Flat list' },
    { value: 'project', label: 'Project', hint: 'Clones of one repo collapse into one group' },
    { value: 'repository', label: 'Checkout' },
    { value: 'gate', label: 'Gate' },
  ],
  orderBy: [
    { value: 'slug', label: 'Name' },
    { value: 'activity', label: 'Most recent activity' },
    { value: 'remaining', label: 'Most work left' },
    { value: 'blockers', label: 'Most blocked' },
  ],
  properties: [
    { value: 'branch', label: 'Branch' },
    { value: 'ready', label: 'Pickable' },
    { value: 'review', label: 'In review' },
    { value: 'critical', label: 'Critical path' },
    { value: 'remaining', label: 'Work left' },
    { value: 'blocked', label: 'Blocking assumptions' },
    { value: 'coverage', label: 'AC covered' },
    { value: 'activity', label: 'Last activity' },
  ],
};

/** What each filterable property reads off a row. */
export function readProperty(row: FeatureSummary, property: string): string {
  switch (property) {
    case 'project':
      return row.projectLabel;
    case 'repository':
      return row.repositoryLabel;
    case 'branch':
      return row.branch ?? '';
    case 'gate':
      return row.managed ? row.gate : 'unmanaged';
    case 'profile':
      return row.profile;
    default:
      return '';
  }
}

export function sortRows(rows: FeatureSummary[], orderBy: string): FeatureSummary[] {
  const sorted = [...rows];
  switch (orderBy) {
    case 'activity':
      return sorted.sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''));
    case 'remaining':
      return sorted.sort((a, b) => b.remainingHours - a.remainingHours);
    case 'blockers':
      return sorted.sort((a, b) => b.blockingAssumptionsOpen - a.blockingAssumptionsOpen);
    default:
      return sorted.sort((a, b) => a.slug.localeCompare(b.slug));
  }
}

export function laneOf(
  row: FeatureSummary,
  groupBy: string,
): { key: string; label: string; sublabel: string | null } {
  switch (groupBy) {
    case 'project':
      return { key: row.projectKey, label: row.projectLabel, sublabel: null };
    case 'repository':
      return { key: row.repositoryId, label: row.repositoryLabel, sublabel: row.branch };
    case 'gate': {
      const gate = row.managed ? row.gate : 'unmanaged';
      return { key: gate, label: gate, sublabel: null };
    }
    default:
      return { key: 'all', label: '', sublabel: null };
  }
}
