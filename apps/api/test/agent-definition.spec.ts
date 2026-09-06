import { describe, expect, it } from 'vitest';

import { AgentDefinition } from '../src/contexts/agents/domain/model/agent-definition';

const claude = () =>
  AgentDefinition.create({
    id: 'claude',
    label: 'Claude Code',
    binary: 'claude',
    args: ['-p', '--output-format', 'stream-json', '--verbose'],
    resumeArgs: ['-r', '{{session}}', '-p', '--output-format', 'stream-json', '--verbose'],
  });

/**
 * Resume is a declared capability, never an inferred flag.
 *
 * The failure this guards against is quiet: a CLI handed a flag it does not understand
 * does not exit — it drops into an interactive session and hangs behind a pipe until the
 * run's timeout kills it, holding the ticket's only run slot for the whole wait. So the
 * default has to be "cannot", and the "cannot" path has to throw rather than improvise.
 */
describe('AgentDefinition resume capability', () => {
  it('cannot resume unless an invocation is declared', () => {
    const codex = AgentDefinition.create({ id: 'codex', binary: 'codex', args: ['exec', '{{prompt}}'] });

    expect(codex.canResume).toBe(false);
    expect(codex.resumeArgs).toBeNull();
  });

  it('substitutes the session id and leaves every other argument alone', () => {
    expect(claude().argsForResume('d995a168', 'the assertion is wrong')).toEqual([
      '-r',
      'd995a168',
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
    ]);
  });

  it('substitutes the prompt too, for a CLI that takes it in argv', () => {
    const arged = AgentDefinition.create({
      id: 'imaginary',
      binary: 'imaginary',
      promptVia: 'arg',
      resumeArgs: ['resume', '--session', '{{session}}', '{{prompt}}'],
    });

    expect(arged.argsForResume('abc', 'try again')).toEqual(['resume', '--session', 'abc', 'try again']);
  });

  it('throws instead of falling back to a fresh run', () => {
    // A fallback would start a new session while the caller believed it was continuing
    // one: the agent answers with no context and the console labels it a continuation.
    const copilot = AgentDefinition.create({ id: 'copilot', label: 'GitHub Copilot CLI', binary: 'copilot' });

    expect(() => copilot.argsForResume('d995a168', 'anything')).toThrowError(/no resume invocation/);
  });

  it('refuses a blank session id', () => {
    expect(() => claude().argsForResume('   ', 'anything')).toThrowError(/without a session id/);
  });

  it('keeps the resume invocation when availability is resolved', () => {
    // withAvailability rebuilds the whole props object; a field dropped here would make
    // every agent unresumable the moment the catalog located it on PATH.
    const located = claude().withAvailability(true, '/Users/someone/.local/bin/claude');

    expect(located.canResume).toBe(true);
    expect(located.resumeArgs).toEqual(claude().resumeArgs);
    expect(located.resolvedPath).toBe('/Users/someone/.local/bin/claude');
  });

  it('leaves the launch invocation untouched', () => {
    expect(claude().argsFor('<prompt>')).toEqual(['-p', '--output-format', 'stream-json', '--verbose']);
  });
});
