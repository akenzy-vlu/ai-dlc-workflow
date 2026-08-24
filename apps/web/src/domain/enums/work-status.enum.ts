/**
 * The ticket lifecycle the AI-DLC controller enforces.
 *
 * `blocked` is not reachable through any controller transition — it is written by hand
 * into a ticket that cannot proceed — so it is a valid state to read but never a
 * transition target.
 */
export const WORK_STATUSES = ['todo', 'in_progress', 'review', 'done', 'blocked'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  todo: 'Todo',
  in_progress: 'In progress',
  review: 'In review',
  done: 'Done',
  blocked: 'Blocked',
};

/**
 * What each state means for the reader, and why. `review` is the only one where the work
 * has stopped and is waiting on a person, which is why it is the only one the theme
 * accents.
 */
export const WORK_STATUS_HINTS: Record<WorkStatus, string> = {
  todo: 'Not started',
  in_progress: 'Someone — or some agent — is on it',
  review: 'Handed off. Needs a different person to accept',
  done: 'Accepted',
  blocked: 'Marked blocked by hand; the status alone says nothing about what by',
};

/** Ordered least to most advanced, for reconciling one ticket seen in several checkouts. */
export const WORK_STATUS_RANK: Record<WorkStatus, number> = {
  blocked: 0,
  todo: 1,
  in_progress: 2,
  review: 3,
  done: 4,
};
