import { Estimate } from '../../../../shared/kernel';
import { Ticket } from '../model/ticket';

export interface WriteConflict {
  a: string;
  b: string;
  paths: string[];
}

export interface CriticalPath {
  ticketIds: string[];
  total: Estimate;
}

/**
 * The dependency graph over one feature's tickets.
 *
 * A faithful port of the algorithms in `ai-dlc-core/scripts/uow_graph.py`. It is a domain
 * *service* rather than a method on an aggregate because it answers questions about a set
 * of tickets, not about any one of them — waves, the critical path, what is pickable, and
 * which pairs would collide if run in parallel.
 */
export class TicketGraph {
  private readonly byId: Map<string, Ticket>;

  constructor(tickets: readonly Ticket[]) {
    this.byId = new Map(tickets.map((t) => [t.id.value, t]));
  }

  get tickets(): Ticket[] {
    return [...this.byId.values()].sort((a, b) => a.id.value.localeCompare(b.id.value));
  }

  get size(): number {
    return this.byId.size;
  }

  /**
   * Kahn's algorithm by level. `cycle` lists the tickets left with unmet in-degree — a
   * dependency loop, which is a hard G3 failure and makes every other number meaningless.
   */
  waves(): { waves: string[][]; cycle: string[] } {
    const indegree = new Map<string, number>();
    const children = new Map<string, string[]>();
    for (const id of this.byId.keys()) {
      indegree.set(id, 0);
      children.set(id, []);
    }
    for (const ticket of this.byId.values()) {
      for (const dep of ticket.dependsOn) {
        if (!this.byId.has(dep.value)) continue;
        indegree.set(ticket.id.value, (indegree.get(ticket.id.value) ?? 0) + 1);
        children.get(dep.value)!.push(ticket.id.value);
      }
    }

    const waves: string[][] = [];
    let frontier = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id).sort();
    let placed = 0;

    while (frontier.length > 0) {
      waves.push([...frontier]);
      const next: string[] = [];
      for (const node of frontier) {
        placed++;
        for (const child of children.get(node) ?? []) {
          const remaining = (indegree.get(child) ?? 0) - 1;
          indegree.set(child, remaining);
          if (remaining === 0) next.push(child);
        }
      }
      frontier = next.sort();
    }

    const cycle = placed < this.byId.size
      ? [...indegree.entries()].filter(([, d]) => d > 0).map(([id]) => id).sort()
      : [];

    return { waves, cycle };
  }

  /**
   * Longest path by estimate hours — the floor on elapsed time no amount of parallelism
   * removes. Total effort is the sum; this is the number that decides the calendar.
   */
  criticalPath(): CriticalPath {
    const memo = new Map<string, number>();
    const bestChild = new Map<string, string | null>();

    const visit = (id: string, seen: ReadonlySet<string>): number => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      if (seen.has(id)) return 0;

      const nextSeen = new Set(seen).add(id);
      const own = this.byId.get(id)?.estimate.hours ?? 0;
      let best = 0;
      let chosen: string | null = null;

      for (const dep of this.byId.get(id)?.dependsOn ?? []) {
        if (!this.byId.has(dep.value)) continue;
        const cost = visit(dep.value, nextSeen);
        if (cost > best) {
          best = cost;
          chosen = dep.value;
        }
      }

      memo.set(id, own + best);
      bestChild.set(id, chosen);
      return own + best;
    };

    for (const id of this.byId.keys()) visit(id, new Set());
    if (memo.size === 0) return { ticketIds: [], total: Estimate.ZERO };

    let end = '';
    let max = -1;
    for (const [id, cost] of memo) {
      if (cost > max) {
        max = cost;
        end = id;
      }
    }

    const path: string[] = [];
    let node: string | null = end;
    while (node) {
      path.push(node);
      node = bestChild.get(node) ?? null;
    }
    return { ticketIds: path.reverse(), total: Estimate.fromHours(max) };
  }

  /** Total effort if one person did everything. Contrast with the critical path. */
  totalEffort(): Estimate {
    return Estimate.fromHours(this.tickets.reduce((sum, t) => sum + t.estimate.hours, 0));
  }

  /** Every ticket this one transitively depends on. */
  ancestors(): Map<string, Set<string>> {
    const cache = new Map<string, Set<string>>();

    const walk = (id: string, seen: ReadonlySet<string>): Set<string> => {
      const cached = cache.get(id);
      if (cached) return cached;
      const out = new Set<string>();
      for (const dep of this.byId.get(id)?.dependsOn ?? []) {
        if (!this.byId.has(dep.value) || seen.has(dep.value)) continue;
        out.add(dep.value);
        for (const a of walk(dep.value, new Set(seen).add(id))) out.add(a);
      }
      cache.set(id, out);
      return out;
    };

    const result = new Map<string, Set<string>>();
    for (const id of this.byId.keys()) result.set(id, walk(id, new Set()));
    return result;
  }

  /**
   * Pairs that write the same file with nothing ordering them.
   *
   * Wave membership is the wrong test and the comment in uow_graph.py says why: waves are
   * topological levels, not a schedule. Two tickets in different waves with no dependency
   * path between them can still be in flight together, and then one of them loses its
   * work. This is the check that makes handing tickets to parallel agents survivable.
   */
  writeConflicts(): WriteConflict[] {
    const ancestors = this.ancestors();
    const ids = [...this.byId.keys()].sort();
    const out: WriteConflict[] = [];

    for (let i = 0; i < ids.length; i++) {
      const a = ids[i];
      const pathsA = new Set(this.byId.get(a)!.writePaths);
      if (pathsA.size === 0) continue;

      for (let j = i + 1; j < ids.length; j++) {
        const b = ids[j];
        if (ancestors.get(a)?.has(b) || ancestors.get(b)?.has(a)) continue;
        const overlap = this.byId.get(b)!.writePaths.filter((p) => pathsA.has(p));
        if (overlap.length > 0) out.push({ a, b, paths: [...new Set(overlap)].sort() });
      }
    }
    return out;
  }

  /**
   * Tickets that are `todo` with every dependency `done`.
   *
   * The gate check lives one level up: a ticket in a feature below G3 is not pickable at
   * all, however satisfied its dependencies are. That is the point of the gate.
   */
  readyTickets(): Ticket[] {
    return this.tickets.filter((ticket) => {
      if (ticket.status.value !== 'todo') return false;
      return ticket.dependsOn.every((dep) => this.byId.get(dep.value)?.status.isDone ?? false);
    });
  }

  unmetDependencyCount(ticket: Ticket): number {
    return ticket.dependsOn.filter((dep) => !this.byId.get(dep.value)?.status.isDone).length;
  }

  /** Dependency edges naming a ticket that does not exist. A hard G3 failure. */
  danglingReferences(): { from: string; to: string; kind: 'depends_on' | 'blocks' }[] {
    const out: { from: string; to: string; kind: 'depends_on' | 'blocks' }[] = [];
    for (const ticket of this.tickets) {
      for (const dep of ticket.dependsOn) {
        if (!this.byId.has(dep.value)) out.push({ from: ticket.id.value, to: dep.value, kind: 'depends_on' });
      }
      for (const blocked of ticket.blocks) {
        if (!this.byId.has(blocked.value)) out.push({ from: ticket.id.value, to: blocked.value, kind: 'blocks' });
      }
    }
    return out;
  }
}
