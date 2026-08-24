import { describe, expect, it } from 'vitest';

import { translateStreamJson } from '../src/contexts/agents/infrastructure/stream-json.translator';

const AT = '2026-08-23T15:00:00.000Z';

/**
 * The fixtures below are real lines captured from
 * `claude -p --output-format stream-json --verbose`, trimmed of their payload bulk.
 * If the CLI's envelope changes, this is the file that should fail first.
 */
describe('stream-json translator', () => {
  it('returns null for output that is not stream-json, so other CLIs keep working', () => {
    // Codex, Cursor and Copilot print prose. So does `claude -p` without the flag.
    expect(translateStreamJson('Building the refund command…', AT)).toBeNull();
    expect(translateStreamJson('', AT)).toBeNull();
    expect(translateStreamJson('{ not json', AT)).toBeNull();
    expect(translateStreamJson('[1,2,3]', AT)).toBeNull();
  });

  it('takes the session id off the init event and shows nothing', () => {
    const out = translateStreamJson(
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'd995a168', cwd: '/repo', tools: ['Bash'] }),
      AT,
    );
    expect(out?.telemetry.sessionId).toBe('d995a168');
    expect(out?.activities).toEqual([]);
    expect(out?.transcript).toBeNull();
  });

  it('turns tool_use blocks into the one question a running agent has to answer', () => {
    const out = translateStreamJson(
      JSON.stringify({
        type: 'assistant',
        session_id: 'd995a168',
        message: {
          model: 'claude-sonnet-5',
          content: [
            { type: 'text', text: 'Running the suite.' },
            { type: 'tool_use', name: 'Bash', input: { command: 'pnpm test', description: 'run tests' } },
            { type: 'tool_use', name: 'Edit', input: { file_path: 'src/refund.ts', old_string: 'a', new_string: 'b' } },
          ],
        },
      }),
      AT,
    );
    expect(out?.telemetry.model).toBe('claude-sonnet-5');
    expect(out?.activities).toEqual([
      { at: AT, kind: 'text', text: 'Running the suite.' },
      { at: AT, kind: 'tool', tool: 'Bash', detail: 'pnpm test' },
      { at: AT, kind: 'tool', tool: 'Edit', detail: 'src/refund.ts' },
    ]);
  });

  it('finds a detail for a tool it has never heard of', () => {
    // Every MCP tool arrives this way; the console cannot enumerate them in advance.
    const out = translateStreamJson(
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'mcp__linear__create_issue', input: { title: 'Fix refunds' } }] },
      }),
      AT,
    );
    expect(out?.activities[0]).toEqual({
      at: AT,
      kind: 'tool',
      tool: 'mcp__linear__create_issue',
      detail: 'Fix refunds',
    });
  });

  it('collapses whitespace and clips a long detail', () => {
    const out = translateStreamJson(
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: `echo ${'x'.repeat(400)}` } }] },
      }),
      AT,
    );
    expect(out?.activities[0].detail).toHaveLength(180);
    expect(out?.activities[0].detail?.endsWith('…')).toBe(true);
  });

  it('reads cost and turns off the final event, which carries no `type`', () => {
    const out = translateStreamJson(
      JSON.stringify({
        is_error: false,
        duration_api_ms: 5236,
        num_turns: 3,
        session_id: 'd995a168',
        total_cost_usd: 0.0303132,
      }),
      AT,
    );
    expect(out?.telemetry).toMatchObject({ costUsd: 0.0303132, numTurns: 3, durationMs: 5236, sessionId: 'd995a168' });
    expect(out?.activities[0].kind).toBe('result');
    expect(out?.activities[0].text).toBe('3 turns · 5.2s · $0.0303');
  });

  it('says so when the run ended in error', () => {
    const out = translateStreamJson(JSON.stringify({ type: 'result', is_error: true, num_turns: 1 }), AT);
    expect(out?.activities[0].text).toContain('ended in error');
  });

  it('drops protocol noise instead of printing it', () => {
    // A rate-limit event every few seconds would bury the two lines that matter.
    const out = translateStreamJson(
      JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' }, session_id: 'd995a168' }),
      AT,
    );
    expect(out?.transcript).toBeNull();
    expect(out?.activities).toEqual([]);
    expect(out?.telemetry.sessionId).toBe('d995a168');
  });
});
