import { AggregateRoot, Estimate, FeatureRef, UowId } from '../../../../shared/kernel';
import { TicketGraph } from '../services/ticket-graph.service';
import { Ticket } from './ticket';
import { UnitOfWork } from './unit-of-work';

/**
 * The Construction half of a feature: its slices, its tickets, and the graph over them.
 *
 * Read-only, like FeaturePlan — every mutation goes out through PlanMutatorPort to the
 * controller. What the aggregate does own is the *questions*: which slices are finished,
 * which acceptance criteria nothing covers, how much of the plan is actually pickable.
 */
export class ConstructionPlan extends AggregateRoot<string> {
  readonly graph: TicketGraph;

  private constructor(
    readonly ref: FeatureRef,
    readonly unitsOfWork: readonly UnitOfWork[],
    readonly tickets: readonly Ticket[],
    /** Problems found while reading the files, before any validation. */
    readonly loadErrors: readonly string[],
  ) {
    super(ref.key);
    this.graph = new TicketGraph(tickets);
  }

  static create(params: {
    ref: FeatureRef;
    unitsOfWork: UnitOfWork[];
    tickets: Ticket[];
    loadErrors?: string[];
  }): ConstructionPlan {
    return new ConstructionPlan(
      params.ref,
      [...params.unitsOfWork].sort((a, b) => a.id.value.localeCompare(b.id.value)),
      [...params.tickets].sort((a, b) => a.id.value.localeCompare(b.id.value)),
      params.loadErrors ?? [],
    );
  }

  get isEmpty(): boolean {
    return this.unitsOfWork.length === 0 && this.tickets.length === 0;
  }

  ticketsOf(uow: UowId): Ticket[] {
    return this.tickets.filter((t) => t.uow?.equals(uow));
  }

  get doneTicketCount(): number {
    return this.tickets.filter((t) => t.status.isDone).length;
  }

  get inProgressTicketCount(): number {
    return this.tickets.filter((t) => t.status.value === 'in_progress').length;
  }

  /** Handed off by an implementer, waiting for a *different* human to accept. */
  get awaitingReview(): Ticket[] {
    return this.tickets.filter((t) => t.status.awaitsReview);
  }

  get blockedTickets(): Ticket[] {
    return this.tickets.filter((t) => t.status.value === 'blocked');
  }

  get totalEffort(): Estimate {
    return this.graph.totalEffort();
  }

  get remainingEffort(): Estimate {
    return Estimate.fromHours(
      this.tickets.filter((t) => !t.status.isDone).reduce((sum, t) => sum + t.estimate.hours, 0),
    );
  }

  get progressRatio(): number {
    return this.tickets.length === 0 ? 0 : this.doneTicketCount / this.tickets.length;
  }

  /** Slices with unticked definition-of-done items — what `check_g4` refuses on. */
  get unfinishedUnitsOfWork(): UnitOfWork[] {
    return this.unitsOfWork.filter((u) => u.blocksConstructionClose);
  }

  /** A slice with no demo script cannot be accepted at G4. */
  get slicesWithoutDemoScript(): UnitOfWork[] {
    return this.unitsOfWork.filter((u) => !u.demoScript);
  }

  /** Which tickets claim each `AC-nn`. The generated `06-traceability.md`, computed. */
  coverageOf(acceptanceCriteriaIds: readonly string[]): { ac: string; ticketIds: string[] }[] {
    const covered = new Map<string, string[]>();
    for (const ticket of this.tickets) {
      for (const ac of ticket.verifies) {
        covered.set(ac, [...(covered.get(ac) ?? []), ticket.id.value]);
      }
    }
    return acceptanceCriteriaIds.map((ac) => ({ ac, ticketIds: covered.get(ac) ?? [] }));
  }

  /** Acceptance criteria no ticket claims. Each one is a hard G3 error. */
  uncoveredCriteria(acceptanceCriteriaIds: readonly string[]): string[] {
    return this.coverageOf(acceptanceCriteriaIds).filter((c) => c.ticketIds.length === 0).map((c) => c.ac);
  }

  /** Tickets naming an `AC-nn` that `02-requirements.md` does not define. */
  orphanCoverage(acceptanceCriteriaIds: readonly string[]): { ticketId: string; ac: string }[] {
    const known = new Set(acceptanceCriteriaIds);
    const out: { ticketId: string; ac: string }[] = [];
    for (const ticket of this.tickets) {
      for (const ac of ticket.verifies) {
        if (!known.has(ac)) out.push({ ticketId: ticket.id.value, ac });
      }
    }
    return out;
  }
}
