import {
  AGENT_RUN_STATUSES,
  GATE_ORDER,
  INBOX_KINDS,
  INBOX_SEVERITIES,
  PROJECT_ORIGINS,
  SEARCH_KINDS,
  VERIFICATION_RUNGS,
  WORK_STATUSES,
  type AgentRunStatus,
  type GateValue,
  type InboxKind,
  type InboxSeverity,
  type ProjectOrigin,
  type SearchKind,
  type VerificationRung,
  type WorkStatus,
} from '@domain/enums';

/**
 * Narrows a wire string to a domain enum, falling back rather than throwing.
 *
 * The API is a program on the same machine, not a hostile input, but the plan files it
 * reads are hand-written — a ticket can carry `status: almost`. Refusing to render such a
 * feature would hide exactly the ones that need attention, so an unrecognised value takes
 * the documented fallback and the plan still shows up.
 */
function narrow<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  const candidate = (value ?? '').trim() as T;
  return allowed.includes(candidate) ? candidate : fallback;
}

export const toGate = (value: string | null | undefined): GateValue =>
  narrow<GateValue>(value, ['none', ...GATE_ORDER], 'none');

export const toNextGate = (value: string | null | undefined) =>
  value && (GATE_ORDER as readonly string[]).includes(value) ? (value as (typeof GATE_ORDER)[number]) : null;

export const toWorkStatus = (value: string | null | undefined): WorkStatus =>
  narrow(value, WORK_STATUSES, 'todo');

export const toInboxSeverity = (value: string | null | undefined): InboxSeverity =>
  narrow(value, INBOX_SEVERITIES, 'hygiene');

export const toInboxKind = (value: string | null | undefined): InboxKind =>
  narrow(value, INBOX_KINDS, 'unmanaged_plan');

export const toVerificationRung = (value: string | null | undefined): VerificationRung =>
  narrow(value, VERIFICATION_RUNGS, 'not applicable');

export const toAgentRunStatus = (value: string | null | undefined): AgentRunStatus =>
  narrow(value, AGENT_RUN_STATUSES, 'queued');

export const toProjectOrigin = (value: string | null | undefined): ProjectOrigin =>
  narrow(value, PROJECT_ORIGINS, 'path');

export const toSearchKind = (value: string | null | undefined): SearchKind =>
  narrow(value, SEARCH_KINDS, 'feature');

export const toLogStream = (value: string | null | undefined): 'stdout' | 'stderr' | 'console' =>
  value === 'stderr' || value === 'console' ? value : 'stdout';
