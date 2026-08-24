import { Injectable } from '@nestjs/common';

import { Query } from '../../../shared/application/use-case';
import { FeatureSnapshotAssembler } from './feature-snapshot.assembler';
import { ReadyTicketRow } from './read-models';

export interface ReadyQueueInput {
  repositoryId?: string;
  layer?: string;
  type?: string;
  maxHours?: number;
}

/**
 * Every ticket that could be started right now, across every repository.
 *
 * Two rules make this list trustworthy rather than merely long. First, the gate: a
 * feature below G3 contributes nothing, however satisfied its dependencies look —
 * construction is locked, and listing its tickets would invite exactly the "start
 * implementing before the plan is agreed" behaviour the gates exist to prevent. Second,
 * `unblocks`: a ticket that frees six others is not the same size of decision as one that
 * frees none, and sorting by estimate alone hides that completely.
 */
@Injectable()
export class ReadyQueueQuery implements Query<ReadyQueueInput, ReadyTicketRow[]> {
  constructor(private readonly assembler: FeatureSnapshotAssembler) {}

  async execute(input: ReadyQueueInput = {}): Promise<ReadyTicketRow[]> {
    const snapshots = await this.assembler.assembleAll();
    const rows: ReadyTicketRow[] = [];

    for (const snapshot of snapshots) {
      if (!snapshot.gateState.isConstructionUnlocked) continue;
      if (input.repositoryId && snapshot.repository.id.value !== input.repositoryId) continue;

      const { construction } = snapshot;
      const criticalPath = new Set(construction.graph.criticalPath().ticketIds);
      const dependents = this.countDependents(construction.tickets.map((t) => ({
        id: t.id.value,
        dependsOn: t.dependsOn.map((d) => d.value),
      })));

      for (const ticket of construction.graph.readyTickets()) {
        if (input.layer && ticket.layer.name !== input.layer) continue;
        if (input.type && ticket.type.value !== input.type) continue;
        if (input.maxHours !== undefined && ticket.estimate.hours > input.maxHours) continue;

        const uow = construction.unitsOfWork.find((u) => ticket.uow && u.id.equals(ticket.uow));
        rows.push({
          repositoryId: snapshot.repository.id.value,
          repositoryLabel: snapshot.repository.label,
          featureSlug: snapshot.gateState.ref.slug.value,
          ticketId: ticket.id.value,
          uowId: ticket.uow?.value ?? null,
          uowTitle: uow?.title ?? null,
          title: ticket.title,
          layer: ticket.layer.name,
          layerDeclared: ticket.layer.isDeclared,
          type: ticket.type.value,
          estimateHours: ticket.estimate.hours,
          estimateLabel: ticket.estimate.toString(),
          verifies: [...ticket.verifies],
          touches: ticket.writePaths,
          unblocks: dependents.get(ticket.id.value)?.size ?? 0,
          onCriticalPath: criticalPath.has(ticket.id.value),
          risk: uow?.risk.value ?? 'unknown',
          gate: snapshot.gateState.currentGate.value,
        });
      }
    }

    return rows.sort((a, b) => {
      if (b.unblocks !== a.unblocks) return b.unblocks - a.unblocks;
      if (a.onCriticalPath !== b.onCriticalPath) return a.onCriticalPath ? -1 : 1;
      return a.estimateHours - b.estimateHours;
    });
  }

  /** Transitive dependents, so `unblocks` counts the whole tail, not just direct children. */
  private countDependents(tickets: { id: string; dependsOn: string[] }[]): Map<string, Set<string>> {
    const children = new Map<string, string[]>();
    for (const ticket of tickets) {
      for (const dep of ticket.dependsOn) {
        children.set(dep, [...(children.get(dep) ?? []), ticket.id]);
      }
    }

    const cache = new Map<string, Set<string>>();
    const walk = (id: string, seen: ReadonlySet<string>): Set<string> => {
      const cached = cache.get(id);
      if (cached) return cached;
      const out = new Set<string>();
      for (const child of children.get(id) ?? []) {
        if (seen.has(child)) continue;
        out.add(child);
        for (const grand of walk(child, new Set(seen).add(id))) out.add(grand);
      }
      cache.set(id, out);
      return out;
    };

    const result = new Map<string, Set<string>>();
    for (const ticket of tickets) result.set(ticket.id, walk(ticket.id, new Set()));
    return result;
  }
}
