import { ValueObject } from './value-object';

/**
 * The ticket lifecycle enforced by `aidlc.py`. `blocked` is not reachable through the
 * controller's transitions — it is written by hand into a ticket that cannot proceed —
 * so it is a valid state to *read* but never a transition target.
 */
export const WORK_STATUSES = ['todo', 'in_progress', 'review', 'done', 'blocked'] as const;
export type WorkStatusValue = (typeof WORK_STATUSES)[number];

/** Controller verbs, and the status each produces. Mirrors ALLOWED_FROM in aidlc.py. */
export const TICKET_ACTIONS = {
  start: 'in_progress',
  submit: 'review',
  accept: 'done',
  reject: 'todo',
  done: 'done',
} as const;
export type TicketAction = keyof typeof TICKET_ACTIONS;

export class WorkStatus extends ValueObject<string> {
  static readonly TODO = new WorkStatus('todo');

  private constructor(value: string) {
    super(value);
  }

  /** Unknown values fall back to `todo` rather than throwing: the files are hand-written. */
  static create(value: string | undefined): WorkStatus {
    const v = (value ?? '').trim().toLowerCase().replace(/[*`]/g, '');
    return (WORK_STATUSES as readonly string[]).includes(v) ? new WorkStatus(v) : WorkStatus.TODO;
  }

  get value(): WorkStatusValue {
    return this.props as WorkStatusValue;
  }
  get isDone(): boolean {
    return this.props === 'done';
  }
  get isOpen(): boolean {
    return !this.isDone;
  }
  /** Work an implementer has handed off and a *different* human must accept. */
  get awaitsReview(): boolean {
    return this.props === 'review';
  }
  toString(): string {
    return this.props;
  }
}
