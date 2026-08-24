/**
 * Why an item is in the inbox. Ordered by how much it costs to leave alone.
 *
 * `blocker` — something is stopped and only a person can restart it.
 * `attention` — work is proceeding on a foundation that will not survive review.
 * `hygiene` — true, worth fixing, nothing is waiting on it.
 */
export type InboxSeverity = 'blocker' | 'attention' | 'hygiene';

export type InboxKind =
  /** Blocking assumption nobody has answered. G1 will not open. */
  | 'blocking_assumption'
  /** The next gate's preconditions pass; it needs a name against it. */
  | 'gate_ready'
  /** A ticket was submitted and needs a *different* human to accept it. */
  | 'ticket_in_review'
  /** `.ai/architecture.md` has no `verified_by`. The cheapest G0 blocker to clear. */
  | 'unsigned_architecture_map'
  /** An ADR still `proposed`. Holds G2 shut, and G5 after it. */
  | 'unresolved_adr'
  /** An acceptance criterion no ticket claims. A hard G3 error. */
  | 'uncovered_criterion'
  /** Two tickets write the same file with nothing ordering them. */
  | 'write_conflict'
  /** A ticket marked `blocked` by hand. */
  | 'blocked_ticket'
  /** A feature directory with no `.aidlc-state.yaml` — outside the controller entirely. */
  | 'unmanaged_plan'
  /** A settled assumption with no note saying who settled it. */
  | 'unjustified_assumption'
  /** `.ai/` is not committed: these plans exist on one machine and nowhere else. */
  | 'plans_local_only'
  /** The repo pins a ruleset the installed uow_graph.py no longer judges by. */
  | 'ruleset_mismatch';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  severity: InboxSeverity;
  repositoryId: string;
  repositoryLabel: string;
  featureSlug: string | null;
  /** What is true. One line, no advice. */
  title: string;
  /** Why it matters, or the verbatim text of the thing that is stuck. */
  detail: string | null;
  /** The concrete next move, when there is exactly one. */
  suggestedAction: string | null;
  /** Ticket, UoW, assumption or ADR id this hangs off, when it hangs off one. */
  subjectId: string | null;
  /** Sorts within a severity. Higher first. */
  weight: number;
}

export const SEVERITY_ORDER: Record<InboxSeverity, number> = {
  blocker: 0,
  attention: 1,
  hygiene: 2,
};

export function sortInbox(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.id.localeCompare(b.id);
  });
}
