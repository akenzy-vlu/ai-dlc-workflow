import { describe, expect, it, vi } from 'vitest';

import { LaunchReadyTickets } from '../src/contexts/agents/application/launch-ready.use-case';

/**
 * Which tickets a "start all" actually starts.
 *
 * The launching is the easy half. The selection is the feature, and the write-conflict
 * rule is the part that stops a batch launch from being destructive: two tickets with no
 * ordering between them that write the same file will be in flight together, and one of
 * them loses its work.
 */
describe('launch all ready tickets', () => {
  const ticket = (
    id: string,
    status: string,
    opts: { unmet?: number } = {},
  ) => ({
    id: { value: id },
    status: { value: status, isDone: status === 'done' },
    unmet: opts.unmet ?? 0,
  });

  const build = (
    tickets: ReturnType<typeof ticket>[],
    conflicts: { a: string; b: string; paths: string[] }[] = [],
    launch = vi.fn(async () => ({ runId: 'run-x' })),
  ) => {
    const graph = {
      unmetDependencyCount: (t: { unmet: number }) => t.unmet,
      writeConflicts: () => conflicts,
    };
    const use = new LaunchReadyTickets(
      { require: vi.fn(async () => ({})) } as never,
      { assemble: vi.fn(async () => ({ construction: { tickets, graph } })) } as never,
      { launch } as never,
    );
    return { use, launch };
  };

  const input = {
    repositoryId: 'jack-erp',
    slug: 'pos-variant-stock-columns',
    agentId: 'claude-code',
    launchedBy: 'akenzy',
    acknowledged: true,
  };

  it('launches every ticket whose dependencies are met', async () => {
    const { use, launch } = build([
      ticket('T-01-03', 'todo'),
      ticket('T-02-03', 'todo'),
    ]);

    const result = await use.execute(input);

    expect(result.launched.map((l) => l.ticketId)).toEqual(['T-01-03', 'T-02-03']);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('resumes an in-progress ticket rather than skipping it', async () => {
    // An interrupted run leaves the ticket here; it is exactly the one worth restarting.
    const { use } = build([ticket('T-01-01', 'in_progress')]);
    const result = await use.execute(input);
    expect(result.launched.map((l) => l.ticketId)).toEqual(['T-01-01']);
  });

  it('leaves out tickets whose dependencies are unfinished', async () => {
    const { use, launch } = build([
      ticket('T-01-01', 'todo'),
      ticket('T-01-02', 'todo', { unmet: 1 }),
    ]);

    const result = await use.execute(input);

    expect(result.launched.map((l) => l.ticketId)).toEqual(['T-01-01']);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('leaves out done and hand-blocked tickets', async () => {
    const { use, launch } = build([
      ticket('T-01-01', 'done'),
      ticket('T-01-02', 'blocked'),
    ]);

    const result = await use.execute(input);

    expect(result.launched).toEqual([]);
    expect(launch).not.toHaveBeenCalled();
  });

  it('holds back one side of a write conflict, and says which and why', async () => {
    const { use, launch } = build(
      [ticket('T-04-02', 'todo'), ticket('T-05-02', 'todo')],
      [{ a: 'T-04-02', b: 'T-05-02', paths: ['src/pos/catalog.service.ts'] }],
    );

    const result = await use.execute(input);

    expect(result.launched.map((l) => l.ticketId)).toEqual(['T-04-02']);
    expect(launch).toHaveBeenCalledTimes(1);
    const skip = result.skipped.find((s) => s.ticketId === 'T-05-02');
    expect(skip?.reason).toContain('T-04-02');
    expect(skip?.reason).toContain('src/pos/catalog.service.ts');
  });

  it('picks the same side of a conflict every run', async () => {
    // Alternating would make the skip message flap and confuse anyone reading two runs.
    const conflicts = [{ a: 'T-04-02', b: 'T-05-02', paths: ['x.ts'] }];
    const first = build([ticket('T-05-02', 'todo'), ticket('T-04-02', 'todo')], conflicts);
    const second = build([ticket('T-04-02', 'todo'), ticket('T-05-02', 'todo')], conflicts);

    const a = await first.use.execute(input);
    const b = await second.use.execute(input);

    expect(a.launched.map((l) => l.ticketId)).toEqual(b.launched.map((l) => l.ticketId));
  });

  it('carries on when one launch is refused', async () => {
    // "already has an agent working on it" is the common case and is information, not a
    // reason to abandon the other tickets.
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error('T-01-03 already has an agent working on it'))
      .mockResolvedValue({ runId: 'run-2' });
    const { use } = build([ticket('T-01-03', 'todo'), ticket('T-02-03', 'todo')], [], launch);

    const result = await use.execute(input);

    expect(result.launched.map((l) => l.ticketId)).toEqual(['T-02-03']);
    expect(result.skipped[0]).toMatchObject({ ticketId: 'T-01-03' });
    expect(result.skipped[0].reason).toContain('already has an agent');
  });

  it('passes the acknowledgement through to every launch', async () => {
    const { use, launch } = build([ticket('T-01-03', 'todo')]);
    await use.execute(input);
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ acknowledged: true }));
  });
});
