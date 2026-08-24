import { describe, expect, it } from 'vitest';

import { Estimate, Layer, TicketId, TicketType, UowId, WorkStatus } from '../src/shared/kernel';
import { Ticket } from '../src/contexts/construction/domain/model/ticket';
import { TicketGraph } from '../src/contexts/construction/domain/services/ticket-graph.service';

function ticket(
  id: string,
  options: { deps?: string[]; hours?: number; status?: string; touches?: string[] } = {},
): Ticket {
  return Ticket.create({
    id: TicketId.create(id),
    uow: UowId.create('UOW-01'),
    title: id,
    layer: Layer.create('api', ['api']),
    type: TicketType.create('feature'),
    estimate: Estimate.fromHours(options.hours ?? 1),
    status: WorkStatus.create(options.status ?? 'todo'),
    dependsOn: (options.deps ?? []).map(TicketId.create),
    blocks: [],
    verifies: [],
    touches: options.touches ?? [],
    assumptions: [],
    doneWhen: [],
    filePath: `${id}.md`,
    parseError: null,
  });
}

describe('TicketGraph', () => {
  it('groups tickets into topological waves', () => {
    const graph = new TicketGraph([
      ticket('T-01-01'),
      ticket('T-01-02', { deps: ['T-01-01'] }),
      ticket('T-01-03', { deps: ['T-01-01'] }),
      ticket('T-01-04', { deps: ['T-01-02', 'T-01-03'] }),
    ]);
    const { waves, cycle } = graph.waves();
    expect(cycle).toEqual([]);
    expect(waves).toEqual([['T-01-01'], ['T-01-02', 'T-01-03'], ['T-01-04']]);
  });

  it('names the tickets in a dependency cycle', () => {
    const graph = new TicketGraph([
      ticket('T-01-01', { deps: ['T-01-02'] }),
      ticket('T-01-02', { deps: ['T-01-01'] }),
    ]);
    expect(graph.waves().cycle).toEqual(['T-01-01', 'T-01-02']);
  });

  it('finds the longest chain by estimate, not the widest', () => {
    // Total effort is 10h; the chain that decides the calendar is 7h.
    const graph = new TicketGraph([
      ticket('T-01-01', { hours: 1 }),
      ticket('T-01-02', { deps: ['T-01-01'], hours: 6 }),
      ticket('T-01-03', { deps: ['T-01-01'], hours: 3 }),
    ]);
    const path = graph.criticalPath();
    expect(path.total.hours).toBe(7);
    expect(path.ticketIds).toEqual(['T-01-01', 'T-01-02']);
    expect(graph.totalEffort().hours).toBe(10);
  });

  it('reports a collision only between tickets nothing orders', () => {
    // T-01-02 depends on T-01-01, so they cannot be in flight together — not a hazard.
    // T-01-03 is unrelated to both, so sharing a file with T-01-01 is one.
    const graph = new TicketGraph([
      ticket('T-01-01', { touches: ['src/a.ts'] }),
      ticket('T-01-02', { deps: ['T-01-01'], touches: ['src/a.ts'] }),
      ticket('T-01-03', { touches: ['src/a.ts'] }),
    ]);
    const conflicts = graph.writeConflicts();
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => `${c.a}+${c.b}`).sort()).toEqual(['T-01-01+T-01-03', 'T-01-02+T-01-03']);
  });

  it('ignores the annotation when comparing written paths', () => {
    const graph = new TicketGraph([
      ticket('T-01-01', { touches: ['src/a.ts  # new'] }),
      ticket('T-01-02', { touches: ['src/a.ts'] }),
    ]);
    expect(graph.writeConflicts()).toHaveLength(1);
  });

  it('treats a ticket as ready only when every dependency is done', () => {
    const graph = new TicketGraph([
      ticket('T-01-01', { status: 'done' }),
      ticket('T-01-02', { status: 'review' }),
      ticket('T-01-03', { deps: ['T-01-01'] }),
      ticket('T-01-04', { deps: ['T-01-02'] }),
    ]);
    expect(graph.readyTickets().map((t) => t.id.value)).toEqual(['T-01-03']);
  });

  it('surfaces edges pointing at tickets that do not exist', () => {
    const graph = new TicketGraph([ticket('T-01-01', { deps: ['T-09-99'] })]);
    expect(graph.danglingReferences()).toEqual([
      { from: 'T-01-01', to: 'T-09-99', kind: 'depends_on' },
    ]);
  });
});
