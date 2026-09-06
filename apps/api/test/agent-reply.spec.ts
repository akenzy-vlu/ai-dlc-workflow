import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AgentDefinition } from '../src/contexts/agents/domain/model/agent-definition';
import { AgentLauncherService } from '../src/contexts/agents/application/agent-launcher.service';
import { AgentRun } from '../src/contexts/agents/domain/model/agent-run';
import { TicketId, WorkStatus } from '../src/shared/kernel';

/**
 * `reply()` and `thread()`, exercised through the public service rather than by reading
 * the source. `T-02-08` owns the exhaustive four-refusal matrix and the gate proof (a
 * recording `TicketOperations` double asserting only `submit` is ever called); these are
 * the ticket's own claims — a resumable reply starts with the parent's session, the child's
 * prompt carries no brief, and the thread orders correctly with `canReply` resolved.
 */

const claude = AgentDefinition.create({
  id: 'claude',
  label: 'Claude Code',
  binary: 'claude',
  args: ['-p', '--output-format', 'stream-json', '--verbose'],
  resumeArgs: ['-r', '{{session}}', '-p', '--output-format', 'stream-json', '--verbose'],
  available: true,
});

const codexNoResume = AgentDefinition.create({ id: 'codex', label: 'OpenAI Codex', binary: 'codex', available: true });

const finishedRun = (overrides: Partial<Parameters<typeof AgentRun.create>[0]> = {}) => {
  const run = AgentRun.create({
    id: 'run-1',
    repositoryId: 'console',
    repositoryLabel: 'AI-DLC Console',
    slug: '2026082801-agent-chat-console',
    ticketId: 'T-02-06',
    agentId: 'claude',
    agentLabel: 'Claude Code',
    launchedBy: 'Akenzy',
    actingAs: 'Claude Code (via Akenzy)',
    cwd: '/repo',
    command: 'claude -p --output-format stream-json --verbose',
    promptPreview: 'the brief',
    createdAt: '2026-08-28T10:00:00.000Z',
    ...overrides,
  });
  run.start('2026-08-28T10:00:01.000Z');
  run.mergeTelemetry({ sessionId: 'fa589dc9' });
  run.finish(0, '2026-08-28T10:05:00.000Z');
  return run;
};

/** A ticket double built from the real TicketId/WorkStatus value objects, nothing faked. */
const ticket = (status: 'todo' | 'in_progress' | 'review' | 'done' = 'in_progress') => ({
  id: TicketId.tryCreate('T-02-06')!,
  status: WorkStatus.create(status),
});

const repository = {
  label: 'AI-DLC Console',
  absolutePath: '/repo',
  featuresDirectory: '/repo/.ai/features',
};

function service(opts: {
  definition?: AgentDefinition | null;
  runs: AgentRun[];
  launch?: ReturnType<typeof vi.fn>;
  status?: 'todo' | 'in_progress' | 'review' | 'done';
}) {
  const store = {
    save: vi.fn().mockResolvedValue(undefined),
    find: vi.fn(async (id: string) => opts.runs.find((r) => r.id === id) ?? null),
    // Mirrors the real stores' filter, `active` included — `reply()`'s conflict check
    // depends on `active: true` actually excluding terminal runs, the same as `launch`'s.
    list: vi.fn(
      async (filter: { repositoryId?: string; slug?: string; ticketId?: string; active?: boolean } = {}) =>
        opts.runs.filter((r) => {
          if (filter.repositoryId && r.repositoryId !== filter.repositoryId) return false;
          if (filter.slug && r.slug !== filter.slug) return false;
          if (filter.ticketId && r.ticketId !== filter.ticketId) return false;
          if (filter.active !== undefined && r.isTerminal === filter.active) return false;
          return true;
        }),
    ),
  };
  const catalog = { find: vi.fn().mockResolvedValue(opts.definition ?? claude), list: vi.fn() };
  const launch = opts.launch ?? vi.fn().mockResolvedValue({ command: 'claude', exitCode: 0, cancelled: false });
  const processes = { launch, cancel: vi.fn(), isRunning: vi.fn() };
  const repositories = { require: vi.fn().mockResolvedValue(repository) };
  const assembler = {
    assembleById: vi.fn().mockResolvedValue({ construction: { tickets: [ticket(opts.status)] } }),
    invalidate: vi.fn(),
  };
  const tickets = { transition: vi.fn() };
  const briefings = { build: vi.fn() };

  const svc = new AgentLauncherService(
    catalog as never,
    processes as never,
    store as never,
    repositories as never,
    assembler as never,
    tickets as never,
    briefings as never,
  );
  return { svc, store, catalog, launch, tickets };
}

describe('reply()', () => {
  it('starts a run with the parent session, carrying only the reply as its prompt', async () => {
    const parent = finishedRun();
    const { svc, launch, tickets } = service({ runs: [parent] });

    const { runId } = await svc.reply({
      runId: parent.id,
      message: 'the test asserts the wrong error type; use SeatUnavailableFailure',
      repliedBy: 'Akenzy',
      acknowledged: true,
    });

    expect(runId).not.toBe(parent.id);
    const request = launch.mock.calls[0][0];
    expect(request.resumeSessionId).toBe('fa589dc9');
    expect(request.prompt).toBe('the test asserts the wrong error type; use SeatUnavailableFailure');
    expect(request.run.promptPreview).toBe(request.prompt);
    // The gate proof, at the level this ticket owns: no transition anywhere in the call.
    expect(tickets.transition).not.toHaveBeenCalled();
  });

  it('refuses without spawning when the parent reported no session', async () => {
    const parent = finishedRun({ id: 'run-no-session' });
    // Overwrite what finishedRun() set, the way a CLI with no --output-format would.
    parent.restoreTelemetry({
      sessionId: null,
      model: null,
      costUsd: null,
      numTurns: null,
      durationMs: null,
      toolCalls: 0,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
    });
    const { svc, launch } = service({ runs: [parent] });

    await expect(
      svc.reply({ runId: parent.id, message: 'go on', repliedBy: 'Akenzy', acknowledged: true }),
    ).rejects.toThrow(/no session/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('refuses an agent that declares no resume invocation', async () => {
    const parent = finishedRun();
    const { svc, launch } = service({ runs: [parent], definition: codexNoResume });

    await expect(
      svc.reply({ runId: parent.id, message: 'go on', repliedBy: 'Akenzy', acknowledged: true }),
    ).rejects.toThrow(/declares no resume invocation/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('refuses when another run is already active on the ticket', async () => {
    const parent = finishedRun();
    const active = finishedRun({ id: 'run-active' });
    active.start('2026-08-28T10:06:00.000Z'); // never finished — still active
    const { svc, launch } = service({ runs: [parent, active] });

    await expect(
      svc.reply({ runId: parent.id, message: 'go on', repliedBy: 'Akenzy', acknowledged: true }),
    ).rejects.toThrow(/already has an agent working on it/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('refuses on a ticket that is already done', async () => {
    const parent = finishedRun();
    const { svc, launch } = service({ runs: [parent], status: 'done' });

    await expect(
      svc.reply({ runId: parent.id, message: 'go on', repliedBy: 'Akenzy', acknowledged: true }),
    ).rejects.toThrow(/already done/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('refuses without acknowledgement, before resolving anything', async () => {
    const parent = finishedRun();
    const { svc, store } = service({ runs: [parent] });

    await expect(
      svc.reply({ runId: parent.id, message: 'go on', repliedBy: 'Akenzy', acknowledged: false }),
    ).rejects.toThrow(/acknowledge/);
    expect(store.find).not.toHaveBeenCalled();
  });
});

describe('thread()', () => {
  it('orders runs oldest first and resolves canReply for the latest one', async () => {
    const first = finishedRun({ id: 'run-1', createdAt: '2026-08-28T10:00:00.000Z' });
    const reply = finishedRun({ id: 'run-2', createdAt: '2026-08-28T11:00:00.000Z', parentRunId: 'run-1' });
    const { svc } = service({ runs: [reply, first] }); // stored out of order on purpose

    const thread = await svc.thread('console', '2026082801-agent-chat-console', 'T-02-06');

    expect(thread.runs.map((r) => r.id)).toEqual(['run-1', 'run-2']);
    expect(thread.canReply).toBe(true);
    expect(thread.cannotReplyReason).toBeNull();
    expect(thread.replyTo).toBe('run-2');
  });

  it('states the reason instead of leaving the client to guess', async () => {
    const parent = finishedRun();
    parent.restoreTelemetry({
      sessionId: null,
      model: null,
      costUsd: null,
      numTurns: null,
      durationMs: null,
      toolCalls: 0,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
    });
    const { svc } = service({ runs: [parent] });

    const thread = await svc.thread('console', '2026082801-agent-chat-console', 'T-02-06');

    expect(thread.canReply).toBe(false);
    expect(thread.cannotReplyReason).toMatch(/no session/);
    expect(thread.replyTo).toBeNull();
  });
});

describe('the refusal matrix (AC-02, AC-03)', () => {
  // Table-driven, as the ticket asks: one row per reason `reply()` refuses, each a fresh
  // scenario. Every row must produce a 409 and must never reach the process port — a
  // refusal that still spawns is the exact failure a guessed resume flag would cause.
  const noSession = () => {
    const run = finishedRun();
    run.restoreTelemetry({
      sessionId: null,
      model: null,
      costUsd: null,
      numTurns: null,
      durationMs: null,
      toolCalls: 0,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
    });
    return { runs: [run] };
  };
  const cannotResume = () => ({ runs: [finishedRun()], definition: codexNoResume });
  const alreadyActive = () => {
    const parent = finishedRun();
    const active = finishedRun({ id: 'run-active' });
    active.start('2026-08-28T10:06:00.000Z');
    return { runs: [parent, active] };
  };
  const ticketDone = () => ({ runs: [finishedRun()], status: 'done' as const });

  const rows: [string, () => Parameters<typeof service>[0]][] = [
    ['no session reported', noSession],
    ['agent declares no resume invocation', cannotResume],
    ['another run already active on the ticket', alreadyActive],
    ['ticket already done', ticketDone],
  ];

  it.each(rows)('%s → 409, nothing spawned', async (_label, scenario) => {
    const opts = scenario();
    const { svc, launch } = service(opts);

    const failure = await svc
      .reply({ runId: opts.runs[0].id, message: 'go on', repliedBy: 'Akenzy', acknowledged: true })
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ConflictException);
    expect((failure as ConflictException).getStatus()).toBe(409);
    expect(launch).not.toHaveBeenCalled();
  });
});

describe('the gate proof (AC-08)', () => {
  /**
   * AC-08 is what this feature is judged on: chat must be powerless over plan state.
   *
   * `TicketOperations.transition` is the only seam through which a ticket transition — and
   * so any write under the target repo's `.ai/` — can happen; `aidlc.py` is the only writer
   * of that state, and this port is the only way to reach it from the console. So recording
   * every call this double receives is the direct proof that a reply never writes there:
   * if it happened, it would have to pass through here.
   */
  it('records exactly one transition across a whole reply, and it is submit', async () => {
    const parent = finishedRun();
    const { svc, tickets } = service({
      runs: [parent],
      launch: vi.fn().mockResolvedValue({ command: 'claude', exitCode: 0, cancelled: false }),
    });
    tickets.transition.mockResolvedValue({ accepted: true, output: 'ok', command: 'aidlc submit', exitCode: 0 });

    await svc.reply({ runId: parent.id, message: 'go on', repliedBy: 'Akenzy', acknowledged: true });
    // reply() starts execute() in the background; give its microtask chain — launch,
    // finish, save, handOff, save again — room to run to completion.
    await vi.waitFor(() => expect(tickets.transition).toHaveBeenCalled());

    expect(tickets.transition).toHaveBeenCalledTimes(1);
    expect(tickets.transition.mock.calls[0][0]).toMatchObject({ action: 'submit' });
    // No `start`, no `accept` — the two actions that would mean a reply moved a gate.
    expect(tickets.transition.mock.calls.map((c) => c[0].action)).not.toContain('start');
    expect(tickets.transition.mock.calls.map((c) => c[0].action)).not.toContain('accept');
  });

  it('hands off without a refusal when the ticket is already in review', async () => {
    // The counter-intuitive case the error taxonomy calls out: ALLOWED_FROM permits
    // review → review, so submitting an already-in-review ticket is a no-op transition,
    // not a bug. Worth pinning on its own because it reads like one.
    const parent = finishedRun();
    const { svc, tickets } = service({
      runs: [parent],
      status: 'review',
      launch: vi.fn().mockResolvedValue({ command: 'claude', exitCode: 0, cancelled: false }),
    });
    tickets.transition.mockResolvedValue({
      accepted: true,
      output: 'T-02-06: review → review',
      command: 'aidlc submit',
      exitCode: 0,
    });

    await svc.reply({ runId: parent.id, message: 'go on', repliedBy: 'Akenzy', acknowledged: true });
    await vi.waitFor(() => expect(tickets.transition).toHaveBeenCalled());

    expect(tickets.transition).toHaveBeenCalledTimes(1);
    expect(tickets.transition.mock.calls[0][0]).toMatchObject({ action: 'submit' });
  });

  it('attributes a reply the same way a launch is attributed', async () => {
    const parent = finishedRun();
    const { svc, launch } = service({ runs: [parent] });

    await svc.reply({ runId: parent.id, message: 'go on', repliedBy: 'Akenzy', acknowledged: true });

    const request = launch.mock.calls[0][0];
    expect(request.run.launchedBy).toBe('Akenzy');
    expect(request.run.actingAs).toBe('Claude Code (via Akenzy)');
  });
});
