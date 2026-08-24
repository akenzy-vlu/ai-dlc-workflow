/**
 * Why an item is in the inbox, ordered by what it costs to leave alone.
 *
 * `blocker` — something is stopped and only a person can restart it.
 * `attention` — work proceeds on a foundation that will not survive review.
 * `hygiene` — true, worth fixing, nothing is waiting on it.
 */
export const INBOX_SEVERITIES = ['blocker', 'attention', 'hygiene'] as const;
export type InboxSeverity = (typeof INBOX_SEVERITIES)[number];

export const INBOX_KINDS = [
  'blocking_assumption',
  'gate_ready',
  'ticket_in_review',
  'unsigned_architecture_map',
  'unresolved_adr',
  'uncovered_criterion',
  'write_conflict',
  'blocked_ticket',
  'unmanaged_plan',
  'unjustified_assumption',
  'plans_local_only',
  'ruleset_mismatch',
] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

export const INBOX_KIND_LABELS: Record<InboxKind, string> = {
  blocking_assumption: 'Blocking assumption',
  gate_ready: 'Gate ready to approve',
  ticket_in_review: 'Waiting for review',
  unsigned_architecture_map: 'Unsigned architecture map',
  unresolved_adr: 'Undecided ADR',
  uncovered_criterion: 'Uncovered criterion',
  write_conflict: 'Parallel write collision',
  blocked_ticket: 'Blocked ticket',
  unmanaged_plan: 'Plan outside the controller',
  unjustified_assumption: 'Unjustified resolution',
  plans_local_only: 'Plans not committed',
  ruleset_mismatch: 'Ruleset mismatch',
};
