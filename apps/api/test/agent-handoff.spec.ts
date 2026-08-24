import { describe, expect, it, vi } from 'vitest';

import { AgentLauncherService } from '../src/contexts/agents/application/agent-launcher.service';
import { AgentRun } from '../src/contexts/agents/domain/model/agent-run';
import type { ControllerOutcome } from '../src/contexts/construction/domain/ports/plan-mutator.port';

/**
 * What the console owes the agent after a run.
 *
 * The briefing tells the agent not to move the ticket, on the promise that "the console
 * moves the ticket for you". It did not: the launcher started the ticket, ran the agent,
 * and stopped — so a clean run left the ticket stranded in `in_progress` and a person had
 * to guess whether the work was finished. These lock the promise down.
 */
describe('agent hand-off', () => {
  const run = (status: 'succeeded' | 'failed' | 'cancelled') => {
    const r = AgentRun.create({
      id: 'run-1',
      repositoryId: 'erp2',
      repositoryLabel: 'erp2',
      slug: 'inventory-list-lazy-detail',
      ticketId: 'T-01-01',
      agentId: 'claude-code',
      agentLabel: 'Claude · implement (Sonnet)',
      launchedBy: 'akenzy',
      actingAs: 'Claude · implement (Sonnet) (via akenzy)',
      cwd: '/repo',
      command: 'claude -p',
      promptPreview: '...',
      createdAt: '2026-08-24T10:00:00.000Z',
    });
    r.start('2026-08-24T10:00:01.000Z');
    if (status === 'succeeded') r.finish(0, '2026-08-24T10:05:00.000Z');
    if (status === 'failed') r.finish(1, '2026-08-24T10:05:00.000Z');
    if (status === 'cancelled') r.finish(-1, '2026-08-24T10:05:00.000Z', true);
    return r;
  };

  const launcher = (outcome: ControllerOutcome) => {
    const transition = vi.fn().mockResolvedValue(outcome);
    const service = new AgentLauncherService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { invalidate: vi.fn() } as never,
      { transition } as never,
      {} as never,
    );
    // handOff is private by design — it is an internal step of finishing a run, not API.
    const handOff = (r: AgentRun) =>
      (service as unknown as { handOff(run: AgentRun): Promise<void> }).handOff(r);
    return { handOff, transition };
  };

  const accepted: ControllerOutcome = {
    accepted: true,
    output: 'T-01-01: in_progress → review',
    command: 'aidlc submit',
    exitCode: 0,
  };
  const refused: ControllerOutcome = {
    accepted: false,
    output: 'refused: T-01-01 has 1 unticked done-when item(s)',
    command: 'aidlc submit',
    exitCode: 1,
  };

  it('submits a clean run for review, attributed to whoever launched it', async () => {
    const { handOff, transition } = launcher(accepted);
    const r = run('succeeded');

    await handOff(r);

    expect(transition).toHaveBeenCalledWith({
      repositoryId: 'erp2',
      slug: 'inventory-list-lazy-detail',
      ticketId: 'T-01-01',
      action: 'submit',
      by: 'Claude · implement (Sonnet) (via akenzy)',
    });
    expect(r.log.at(-1)?.text).toContain('submitted for review');
  });

  it('never accepts — moving to done stays a person\'s judgement', async () => {
    const { handOff, transition } = launcher(accepted);
    await handOff(run('succeeded'));

    const actions = transition.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toEqual(['submit']);
    expect(actions).not.toContain('accept');
    expect(actions).not.toContain('done');
  });

  it('does not hand off a failed run', async () => {
    const { handOff, transition } = launcher(accepted);
    await handOff(run('failed'));
    expect(transition).not.toHaveBeenCalled();
  });

  it('does not hand off a cancelled run', async () => {
    const { handOff, transition } = launcher(accepted);
    await handOff(run('cancelled'));
    expect(transition).not.toHaveBeenCalled();
  });

  it('records the controller\'s refusal verbatim and leaves the ticket alone', async () => {
    // The controller refuses while a done-when box is unticked. That is the honest
    // outcome, and the reason belongs in the transcript rather than being swallowed.
    const { handOff } = launcher(refused);
    const r = run('succeeded');

    await handOff(r);

    expect(r.log.at(-1)?.text).toContain('stays in progress');
    expect(r.log.at(-1)?.text).toContain('unticked done-when item(s)');
  });

  it('keeps the transcript when the hand-off itself throws', async () => {
    const transition = vi.fn().mockRejectedValue(new Error('controller unreachable'));
    const service = new AgentLauncherService(
      {} as never, {} as never, {} as never, {} as never,
      { invalidate: vi.fn() } as never, { transition } as never, {} as never,
    );
    const r = run('succeeded');

    await expect(
      (service as unknown as { handOff(run: AgentRun): Promise<void> }).handOff(r),
    ).resolves.toBeUndefined();
    expect(r.log.at(-1)?.text).toContain('could not submit T-01-01');
  });
});
