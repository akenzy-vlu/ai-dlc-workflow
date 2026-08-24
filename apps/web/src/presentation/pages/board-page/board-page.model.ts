import type { BoardCard } from '@domain/entities';
import type { WorkStatus } from '@domain/enums';
import type { DisplayOptions, DisplaySchema } from '@domain/value-objects';

export const BOARD_VIEW_KEY = 'board';

export const BOARD_COLUMNS: { status: WorkStatus; label: string; hint: string }[] = [
  { status: 'todo', label: 'Todo', hint: 'Not started. Faded cards are waiting on a dependency.' },
  { status: 'in_progress', label: 'In progress', hint: 'Someone — or some agent — is on it.' },
  { status: 'review', label: 'In review', hint: 'Handed off. Needs a different person to accept.' },
  {
    status: 'blocked',
    label: 'Blocked',
    hint: 'Marked blocked by hand; the status alone says nothing about what by.',
  },
  { status: 'done', label: 'Done', hint: 'Accepted.' },
];

export const BOARD_DEFAULTS: DisplayOptions = {
  groupBy: 'project',
  orderBy: 'id',
  properties: ['layer', 'estimate', 'uow', 'checklist'],
  showEmptyGroups: false,
  hideCompleted: true,
  mergeCheckouts: true,
};

export const BOARD_SCHEMA: DisplaySchema = {
  groupBy: [
    { value: 'project', label: 'Project', hint: 'Clones and worktrees of one repo share a lane' },
    { value: 'repository', label: 'Checkout', hint: 'One lane per clone, labelled by branch' },
    { value: 'feature', label: 'Feature' },
    { value: 'uow', label: 'Unit of work' },
    { value: 'layer', label: 'Layer' },
    { value: 'type', label: 'Type' },
    { value: 'none', label: 'No grouping' },
  ],
  orderBy: [
    { value: 'id', label: 'Ticket id' },
    { value: 'critical', label: 'Critical path first' },
    { value: 'ready', label: 'Pickable first' },
    { value: 'estimate', label: 'Largest first' },
  ],
  properties: [
    { value: 'layer', label: 'Layer' },
    { value: 'estimate', label: 'Estimate' },
    { value: 'uow', label: 'Unit of work' },
    { value: 'checklist', label: 'Done-when count' },
    { value: 'branch', label: 'Branch' },
    { value: 'feature', label: 'Feature slug' },
  ],
};

/**
 * `project` is the default lane and the reason grouping exists at all: two clones of one
 * repository on two branches are one project, and laning them apart shows the same
 * fifty-eight tickets twice.
 */
export function laneOf(
  card: BoardCard,
  groupBy: string,
): { key: string; label: string; sublabel: string | null } {
  switch (groupBy) {
    case 'project':
      return { key: card.projectKey, label: card.projectLabel, sublabel: null };
    case 'repository':
      return { key: card.repositoryId, label: card.repositoryLabel, sublabel: card.branch };
    case 'feature':
      return {
        key: `${card.repositoryId}/${card.featureSlug}`,
        label: card.featureSlug,
        sublabel: card.repositoryLabel,
      };
    case 'uow':
      return {
        key: `${card.repositoryId}/${card.featureSlug}/${card.uowId ?? 'none'}`,
        label: card.uowTitle ?? card.uowId ?? 'No unit of work',
        sublabel: card.featureSlug,
      };
    case 'layer':
      return { key: card.layer, label: card.layer, sublabel: null };
    case 'type':
      return { key: card.type, label: card.type, sublabel: null };
    default:
      return { key: 'all', label: '', sublabel: null };
  }
}

export function sortCards(cards: BoardCard[], orderBy: string): BoardCard[] {
  const sorted = [...cards];
  switch (orderBy) {
    case 'estimate':
      return sorted.sort((a, b) => b.estimateHours - a.estimateHours);
    case 'critical':
      return sorted.sort(
        (a, b) =>
          Number(b.onCriticalPath) - Number(a.onCriticalPath) || a.ticketId.localeCompare(b.ticketId),
      );
    case 'ready':
      return sorted.sort(
        (a, b) => Number(b.ready) - Number(a.ready) || a.unmetDependencies - b.unmetDependencies,
      );
    default:
      return sorted.sort((a, b) => a.ticketId.localeCompare(b.ticketId));
  }
}

export const cardKey = (card: BoardCard): string =>
  `${card.projectKey}/${card.featureSlug}/${card.ticketId}`;

export const runKey = (card: Pick<BoardCard, 'repositoryId' | 'featureSlug' | 'ticketId'>): string =>
  `${card.repositoryId}/${card.featureSlug}/${card.ticketId}`;
