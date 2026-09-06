import { describe, expect, it } from 'vitest';

import { AgentRun } from '../src/contexts/agents/domain/model/agent-run';

const base = {
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
  command: 'claude -p',
  promptPreview: 'the brief',
  createdAt: '2026-08-28T10:00:00.000Z',
};

describe('AgentRun as a thread entry', () => {
  it('is not a reply when nothing is linked', () => {
    const run = AgentRun.create(base);

    expect(run.parentRunId).toBeNull();
    expect(run.isReply).toBe(false);
  });

  it('reads back the run it answers', () => {
    // Runs persisted before this field exists load with it absent, which must mean "not a
    // reply" rather than throwing or reading as undefined.
    const reply = AgentRun.create({ ...base, id: 'run-2', parentRunId: 'run-1' });
    const legacy = AgentRun.create({ ...base, parentRunId: undefined });

    expect(reply.parentRunId).toBe('run-1');
    expect(reply.isReply).toBe(true);
    expect(legacy.isReply).toBe(false);
  });

  it('still refuses a run with no human attached to it', () => {
    // A reply is attributed to a person exactly as a launch is.
    expect(() => AgentRun.create({ ...base, parentRunId: 'run-1', launchedBy: '  ' })).toThrowError(
      /who launched it/,
    );
  });
});
