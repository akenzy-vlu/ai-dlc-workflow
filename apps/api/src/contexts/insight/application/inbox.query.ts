import { Injectable } from '@nestjs/common';

import { Query } from '../../../shared/application/use-case';
import { ToolingProbe } from '../../../shared/infrastructure/tooling.probe';
import { FeatureSnapshot } from '../domain/feature-snapshot';
import { InboxItem, sortInbox } from '../domain/inbox-item';
import { FeatureSnapshotAssembler } from './feature-snapshot.assembler';
import { GateVerdictCache } from './gate-verdict.cache';
import { InboxResult } from './read-models';

export interface InboxInput {
  repositoryId?: string;
  severity?: 'blocker' | 'attention' | 'hygiene';
}

/**
 * Everything in the portfolio that is waiting on a person.
 *
 * Multica's inbox is the model: get pinged when an agent needs a call, not for every
 * step. The translation to AI-DLC is direct, because the method already names its own
 * stopping points — a blocking assumption nobody answered, a gate whose preconditions now
 * pass, a ticket an implementer handed off. Each of those is a human decision the system
 * genuinely cannot make, and each one silently stalls a plan until someone makes it.
 *
 * What is deliberately *not* here: progress. "Twelve tickets moved yesterday" is status
 * theatre. This list only holds things that are stopped.
 */
@Injectable()
export class InboxQuery implements Query<InboxInput, InboxResult> {
  constructor(
    private readonly assembler: FeatureSnapshotAssembler,
    private readonly verdicts: GateVerdictCache,
    private readonly tooling: ToolingProbe,
  ) {}

  async execute(input: InboxInput = {}): Promise<InboxResult> {
    const snapshots = await this.assembler.assembleAll();
    const tooling = await this.tooling.status();
    const items: InboxItem[] = [];
    let withoutGateCheck = 0;

    const seenRepositories = new Set<string>();

    for (const snapshot of snapshots) {
      if (input.repositoryId && snapshot.repository.id.value !== input.repositoryId) continue;

      const collected = this.forFeature(snapshot);
      items.push(...collected.items);
      if (collected.gateUnknown) withoutGateCheck++;

      if (!seenRepositories.has(snapshot.repository.id.value)) {
        seenRepositories.add(snapshot.repository.id.value);
        items.push(...this.forRepository(snapshot, tooling.ruleset));
      }
    }

    const filtered = input.severity ? items.filter((i) => i.severity === input.severity) : items;
    const counts: Record<string, number> = {};
    for (const item of filtered) counts[item.kind] = (counts[item.kind] ?? 0) + 1;

    return { items: sortInbox(filtered), counts, featuresWithoutGateCheck: withoutGateCheck };
  }

  private forFeature(snapshot: FeatureSnapshot): { items: InboxItem[]; gateUnknown: boolean } {
    const { repository, gateState, plan, construction } = snapshot;
    const slug = gateState.ref.slug.value;
    const base = {
      repositoryId: repository.id.value,
      repositoryLabel: repository.label,
      featureSlug: slug,
    };
    const at = (kind: string, subject: string) => `${repository.id.value}/${slug}/${kind}/${subject}`;
    const items: InboxItem[] = [];

    // ── A plan the controller does not know about ────────────────────────────
    if (!gateState.managed) {
      items.push({
        ...base,
        id: at('unmanaged_plan', slug),
        kind: 'unmanaged_plan',
        severity: 'attention',
        title: `${slug} has no gate state`,
        detail:
          'The directory holds plan files but no .aidlc-state.yaml, so no gate has ever been ' +
          'checked and no approval was ever recorded for it.',
        suggestedAction: `aidlc -d .ai/features/${slug} init ${slug}`,
        subjectId: null,
        weight: construction.tickets.length,
      });
      // Everything below is judged against a gate. There is no gate here.
      return { items, gateUnknown: false };
    }

    // ── Blocking assumptions: the standup list ───────────────────────────────
    for (const assumption of plan.blockingOpenAssumptions) {
      items.push({
        ...base,
        id: at('assumption', assumption.id),
        kind: 'blocking_assumption',
        severity: 'blocker',
        title: `${assumption.id} is blocking and unanswered`,
        detail: assumption.text,
        suggestedAction: assumption.blastRadius
          ? `If wrong: ${assumption.blastRadius}`
          : 'Answer it in 01-assumptions.md and record who decided',
        subjectId: assumption.id,
        weight: 100,
      });
    }

    // ── An unsigned architecture map: the cheapest blocker in the method ─────
    if (gateState.currentGate.isNone && !plan.architectureMap.verifiedBy) {
      items.push({
        ...base,
        id: at('architecture_map', 'unsigned'),
        kind: 'unsigned_architecture_map',
        severity: 'blocker',
        title: '.ai/architecture.md is unsigned',
        detail:
          plan.architectureMap.present
            ? 'The discovery draft exists but no human has read it and set verified_by. ' +
              'Heuristics can guess a layer convention from filenames; they cannot tell a ' +
              'live convention from a legacy one.'
            : 'No architecture map has been generated for this repository yet.',
        suggestedAction: plan.architectureMap.present
          ? 'Read it, correct it, then add `verified_by: <your name>`'
          : 'Run discover_generic.py against the repo root',
        subjectId: null,
        weight: 95,
      });
    }

    // ── A gate that would pass right now ─────────────────────────────────────
    const nextGate = gateState.nextGate;
    let gateUnknown = false;
    if (nextGate) {
      const verdict = this.verdicts.peek(gateState.ref.key, nextGate);
      if (verdict === null) {
        gateUnknown = true;
      } else if (verdict.isReadyToApprove) {
        items.push({
          ...base,
          id: at('gate_ready', nextGate.value),
          kind: 'gate_ready',
          severity: 'blocker',
          title: `${nextGate.value} preconditions pass — waiting for approval`,
          detail: verdict.satisfied.map((f) => f.message).join('; ') || null,
          suggestedAction: `aidlc -d .ai/features/${slug} pass ${nextGate.value} --by <your name>`,
          subjectId: nextGate.value,
          weight: 90,
        });
      }
    }

    // ── Work handed off, waiting for a second pair of eyes ───────────────────
    for (const ticket of construction.awaitingReview) {
      items.push({
        ...base,
        id: at('review', ticket.id.value),
        kind: 'ticket_in_review',
        severity: 'blocker',
        title: `${ticket.id.value} is in review`,
        detail: ticket.title,
        suggestedAction:
          'An implementer does not accept its own work — a different person runs `accept`',
        subjectId: ticket.id.value,
        weight: 80,
      });
    }

    // ── Design decisions still open ──────────────────────────────────────────
    for (const decision of plan.unresolvedDecisions) {
      items.push({
        ...base,
        id: at('adr', decision.id),
        kind: 'unresolved_adr',
        severity: gateState.currentGate.index >= 2 ? 'blocker' : 'attention',
        title: `${decision.id} is still proposed`,
        detail: decision.title,
        suggestedAction: 'Set **Status:** accepted or rejected in 03-logical-design.md',
        subjectId: decision.id,
        weight: 70,
      });
    }

    // ── Promises nothing implements ──────────────────────────────────────────
    for (const ac of construction.uncoveredCriteria(plan.acceptanceCriteriaIds)) {
      items.push({
        ...base,
        id: at('uncovered', ac),
        kind: 'uncovered_criterion',
        severity: 'attention',
        title: `${ac} has no covering ticket`,
        detail: plan.acceptanceCriteria.find((c) => c.id === ac)?.title ?? null,
        suggestedAction: `Add ${ac} to a ticket's \`verifies:\`, or drop the criterion`,
        subjectId: ac,
        weight: 60,
      });
    }

    // ── Tickets that would overwrite each other ──────────────────────────────
    // Aggregated to one item per feature, not one per pair. A forty-ticket plan touching
    // a few shared files produces conflict pairs quadratically — one real feature here
    // yields seventy-five — and listing each pair separately would bury every blocker in
    // the portfolio behind a single messy plan. The decision is per-feature anyway:
    // you re-cut the slice, you do not adjudicate seventy-five pairs.
    const conflicts = construction.graph.writeConflicts();
    if (conflicts.length > 0) {
      const hotspots = new Map<string, number>();
      for (const conflict of conflicts) {
        for (const filePath of conflict.paths) hotspots.set(filePath, (hotspots.get(filePath) ?? 0) + 1);
      }
      const worst = [...hotspots.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const ticketsInvolved = new Set(conflicts.flatMap((c) => [c.a, c.b]));

      items.push({
        ...base,
        id: at('conflict', 'summary'),
        kind: 'write_conflict',
        severity: 'attention',
        title:
          `${conflicts.length} unordered write collision(s) across ${ticketsInvolved.size} tickets`,
        detail:
          `Most contended: ${worst.map(([f, n]) => `${f} (${n})`).join(', ')}. ` +
          'Nothing orders these tickets, so running them on parallel agents loses one side of the work.',
        suggestedAction: 'Serialise the pairs with depends_on, or split the contended file',
        subjectId: null,
        weight: 55,
      });
    }

    // ── Hand-marked blocked tickets ──────────────────────────────────────────
    for (const ticket of construction.blockedTickets) {
      items.push({
        ...base,
        id: at('blocked', ticket.id.value),
        kind: 'blocked_ticket',
        severity: 'attention',
        title: `${ticket.id.value} is marked blocked`,
        detail: ticket.title,
        suggestedAction: 'Find out what it is waiting on — the status says nothing on its own',
        subjectId: ticket.id.value,
        weight: 50,
      });
    }

    // ── Decisions with nobody's name on them ─────────────────────────────────
    for (const assumption of plan.unjustifiedAssumptions) {
      items.push({
        ...base,
        id: at('unjustified', assumption.id),
        kind: 'unjustified_assumption',
        severity: 'hygiene',
        title: `${assumption.id} is ${assumption.status.value} with no resolution note`,
        detail: assumption.text,
        suggestedAction: 'Record who settled it, and when',
        subjectId: assumption.id,
        weight: 20,
      });
    }

    return { items, gateUnknown };
  }

  /** Repository-wide findings, emitted once per repository rather than per feature. */
  private forRepository(snapshot: FeatureSnapshot, toolingRuleset: number | null): InboxItem[] {
    const { repository } = snapshot;
    const items: InboxItem[] = [];
    const base = {
      repositoryId: repository.id.value,
      repositoryLabel: repository.label,
      featureSlug: null,
    };

    if (repository.plansAreLocalOnly) {
      items.push({
        ...base,
        id: `${repository.id.value}/local_only`,
        kind: 'plans_local_only',
        severity: 'attention',
        title: `${repository.label}: .ai/ is not committed`,
        detail:
          'These plans and their approval trail exist on this machine and nowhere else. ' +
          'Losing the laptop loses the record of who approved what.',
        suggestedAction: 'git add .ai && commit, or push snapshots to a collector',
        subjectId: null,
        weight: 40,
      });
    }

    const pinned = repository.settings.ruleset;
    if (pinned !== null && toolingRuleset !== null && pinned !== toolingRuleset) {
      items.push({
        ...base,
        id: `${repository.id.value}/ruleset`,
        kind: 'ruleset_mismatch',
        severity: 'hygiene',
        title: `${repository.label} pins ruleset ${pinned}, the installed tool judges by ${toolingRuleset}`,
        detail:
          'Plans written under one set of validation rules are being re-judged under another. ' +
          'That is what the pin exists to surface, not something to silence.',
        suggestedAction: `Review the ruleset change, then set \`ruleset: ${toolingRuleset}\` in .ai/aidlc.yaml`,
        subjectId: null,
        weight: 10,
      });
    }

    return items;
  }
}
