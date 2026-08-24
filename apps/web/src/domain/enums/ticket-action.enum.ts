import type { WorkStatus } from './work-status.enum';

/** Controller verbs, and the status each produces. Mirrors ALLOWED_FROM in aidlc.py. */
export const TICKET_ACTIONS = {
  start: 'in_progress',
  submit: 'review',
  accept: 'done',
  reject: 'todo',
  done: 'done',
} as const satisfies Record<string, WorkStatus>;

export type TicketAction = keyof typeof TICKET_ACTIONS;

export const TICKET_ACTION_LABELS: Record<TicketAction, string> = {
  start: 'Start',
  submit: 'Submit for review',
  accept: 'Accept',
  reject: 'Reject',
  done: 'Mark done',
};

/**
 * Which verbs the controller will accept from a given status.
 *
 * A courtesy, not an enforcement: the controller still decides, and this only avoids
 * offering a button certain to be refused. `blocked` deliberately offers nothing —
 * it is a hand-written state with no transition out of it.
 */
export const ALLOWED_ACTIONS: Record<WorkStatus, TicketAction[]> = {
  todo: ['start'],
  in_progress: ['submit', 'done'],
  review: ['accept', 'reject'],
  done: [],
  blocked: [],
};
