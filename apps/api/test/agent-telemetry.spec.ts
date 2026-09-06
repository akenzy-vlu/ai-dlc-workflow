import { describe, expect, it } from 'vitest';

import { emptyTelemetry } from '../src/contexts/agents/domain/model/agent-activity';
import { AgentRun } from '../src/contexts/agents/domain/model/agent-run';

const run = () =>
  AgentRun.create({
    id: 'run-1',
    repositoryId: 'console',
    repositoryLabel: 'AI-DLC Console',
    slug: '2026082801-agent-chat-console',
    ticketId: 'T-03-01',
    agentId: 'claude',
    agentLabel: 'Claude Code',
    launchedBy: 'Akenzy',
    actingAs: 'Claude Code (via Akenzy)',
    cwd: '/repo',
    command: 'claude -p',
    promptPreview: 'the brief',
    createdAt: '2026-08-28T10:00:00.000Z',
  });

/**
 * Absent is not zero.
 *
 * A run that reported no usage and a run that genuinely used no cache have to look
 * different, or the console tells someone a paid run was free.
 */
describe('AgentTelemetry token counts', () => {
  it('starts every count null, never 0', () => {
    const t = emptyTelemetry();

    expect(t.inputTokens).toBeNull();
    expect(t.outputTokens).toBeNull();
    expect(t.cacheReadTokens).toBeNull();
    expect(t.cacheWriteTokens).toBeNull();
    // toolCalls is genuinely a count the console keeps itself, so it does start at 0.
    expect(t.toolCalls).toBe(0);
  });

  it('fills one count without clearing the others', () => {
    // The session id arrives on the first event and the usage block on the last; a naive
    // assign would erase one with the other.
    const r = run();
    r.mergeTelemetry({ sessionId: 'd995a168' });
    r.mergeTelemetry({ inputTokens: 3200, outputTokens: 47200 });
    r.mergeTelemetry({ cacheReadTokens: 5_000_000, cacheWriteTokens: 125_900 });

    expect(r.telemetry.sessionId).toBe('d995a168');
    expect(r.telemetry.inputTokens).toBe(3200);
    expect(r.telemetry.outputTokens).toBe(47200);
    expect(r.telemetry.cacheReadTokens).toBe(5_000_000);
    expect(r.telemetry.cacheWriteTokens).toBe(125_900);
  });

  it('does not let a null patch overwrite a count already reported', () => {
    const r = run();
    r.mergeTelemetry({ inputTokens: 3200 });
    r.mergeTelemetry({ inputTokens: null, outputTokens: 47200 });

    expect(r.telemetry.inputTokens).toBe(3200);
    expect(r.telemetry.outputTokens).toBe(47200);
  });

  it('keeps a real zero, which is not the same as unreported', () => {
    const r = run();
    r.mergeTelemetry({ cacheReadTokens: 0 });

    expect(r.telemetry.cacheReadTokens).toBe(0);
    expect(r.telemetry.cacheWriteTokens).toBeNull();
  });
});

describe('restoring telemetry written before a counter existed', () => {
  it('fills the missing counts with null, not undefined', () => {
    // The stores do `raw.telemetry ?? emptyTelemetry()`, which keeps an object that
    // predates these four fields exactly as it was on disk. Undefined is not "not
    // reported": it is absent from the next serialisation entirely.
    const legacy = {
      sessionId: 'd995a168',
      model: 'claude-opus-5',
      costUsd: 0.31,
      numTurns: 4,
      durationMs: 82_000,
      toolCalls: 11,
    } as unknown as Parameters<AgentRun['restoreTelemetry']>[0];

    const r = run();
    r.restoreTelemetry(legacy);

    expect(r.telemetry.sessionId).toBe('d995a168');
    expect(r.telemetry.toolCalls).toBe(11);
    expect(r.telemetry.inputTokens).toBeNull();
    expect(r.telemetry.cacheWriteTokens).toBeNull();
    expect(Object.keys(r.telemetry)).toContain('inputTokens');
  });
});
