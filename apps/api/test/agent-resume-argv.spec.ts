import { describe, expect, it } from 'vitest';

import { AgentDefinition } from '../src/contexts/agents/domain/model/agent-definition';
import { resolveArgs } from '../src/contexts/agents/infrastructure/spawn-agent.process';

const claude = AgentDefinition.create({
  id: 'claude',
  label: 'Claude Code',
  binary: 'claude',
  args: ['-p', '--output-format', 'stream-json', '--verbose'],
  resumeArgs: ['-r', '{{session}}', '-p', '--output-format', 'stream-json', '--verbose'],
});

const codex = AgentDefinition.create({ id: 'codex', label: 'OpenAI Codex', binary: 'codex', args: ['exec', '{{prompt}}'] });

/**
 * The argv choice, tested without spawning: the suite runs no subprocesses, and this is
 * the only decision `SpawnAgentProcess` makes.
 */
describe('resolveArgs', () => {
  it('leaves a normal launch exactly as it was', () => {
    expect(resolveArgs(claude, 'a long brief')).toEqual(['-p', '--output-format', 'stream-json', '--verbose']);
    expect(resolveArgs(codex, 'a long brief')).toEqual(['exec', 'a long brief']);
  });

  it('builds the resume argv when a session is given', () => {
    expect(resolveArgs(claude, 'the assertion is wrong', 'd995a168')).toEqual([
      '-r',
      'd995a168',
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
    ]);
  });

  it('refuses to resume an agent that declares no invocation', () => {
    // Unreachable in practice — reply() refuses first. Written anyway because the failure
    // is silent: a guessed flag hangs the CLI behind a pipe instead of erroring.
    expect(() => resolveArgs(codex, 'anything', 'd995a168')).toThrowError(/no resume invocation/);
  });

  it('treats an empty session id as an error, not as a fresh launch', () => {
    expect(() => resolveArgs(claude, 'anything', '')).toThrowError(/without a session id/);
  });
});
