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

/**
 * One whole run, recorded from `claude -p --output-format stream-json --verbose` on
 * 2026-08-28 and trimmed of its payload bulk.
 *
 * The individual cases above pin each event shape. This pins the thing a person actually
 * sees: turning the flag on by default (T-01-01) changed what every run's transcript looks
 * like for anyone who never overrode `agents.json`, and a wall of JSON where prose used to
 * be is the failure that would make them turn it back off.
 */
const RECORDED_RUN = [
  '{"type":"system","subtype":"init","session_id":"fa589dc9","cwd":"/repo","model":"claude-opus-5[1m]","tools":["Bash","Edit","Read"]}',
  '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"},"session_id":"fa589dc9"}',
  '{"type":"assistant","session_id":"fa589dc9","message":{"model":"claude-opus-5","role":"assistant","content":[{"type":"text","text":"ok"}]}}',
  '{"type":"result","subtype":"success","session_id":"fa589dc9","is_error":false,"num_turns":1,"duration_ms":1756,"total_cost_usd":0.0819455,"usage":{"input_tokens":2,"output_tokens":4,"cache_read_input_tokens":10103,"cache_creation_input_tokens":7583}}',
];

describe('a whole recorded run', () => {
  const replay = () => {
    let sessionId: string | null = null;
    const transcript: string[] = [];
    for (const line of RECORDED_RUN) {
      const out = translateStreamJson(line, AT);
      expect(out).not.toBeNull();
      // mergeTelemetry's rule, exercised through a real sequence rather than a synthetic
      // patch: undefined and null in a patch leave the current value alone.
      if (out!.telemetry.sessionId != null) sessionId = out!.telemetry.sessionId;
      if (out!.transcript !== null) transcript.push(out!.transcript);
    }
    return { sessionId, transcript };
  };

  it('renders as prose and tool lines, never as raw JSON', () => {
    const { transcript } = replay();
    const joined = transcript.join('\n');

    expect(joined).not.toContain('{"type":');
    expect(joined).not.toContain('session_id');
    expect(joined).toContain('ok');
  });

  it('keeps the session id that arrived on the first event', () => {
    // Every later frame carries it too, but the ones that do not must not clear it —
    // without a surviving session id no run is resumable and the reply path is dark.
    expect(replay().sessionId).toBe('fa589dc9');
  });

  it('drops the rate-limit frame instead of printing it', () => {
    const out = translateStreamJson(RECORDED_RUN[1], AT);

    expect(out?.transcript).toBeNull();
    expect(out?.activities).toEqual([]);
  });
});

/**
 * A-05, settled against the recording rather than against a guess.
 *
 * The register carried it as pending because no fixture here had a `usage` block at all —
 * the keys were assumed from documentation. These assertions are the evidence, and if the
 * CLI's envelope ever renames one of them this is the test that says so.
 */
describe('token counts on the recorded run', () => {
  const RESULT = RECORDED_RUN[RECORDED_RUN.length - 1];

  it('reads the four counts the real result frame carries', () => {
    const out = translateStreamJson(RESULT, AT);

    expect(out?.telemetry.inputTokens).toBe(2);
    expect(out?.telemetry.outputTokens).toBe(4);
    expect(out?.telemetry.cacheReadTokens).toBe(10_103);
    expect(out?.telemetry.cacheWriteTokens).toBe(7583);
  });

  it('reports nothing rather than zero when the same frame carries no usage', () => {
    // Not reported and "used none" have to stay distinguishable: the translator omits the
    // keys, mergeTelemetry leaves them alone, and the run keeps the nulls it started with.
    const stripped = JSON.parse(RESULT) as Record<string, unknown>;
    delete stripped.usage;
    const out = translateStreamJson(JSON.stringify(stripped), AT);

    expect(out?.telemetry.inputTokens).toBeUndefined();
    expect(out?.telemetry.outputTokens).toBeUndefined();
    expect(out?.telemetry.cacheReadTokens).toBeUndefined();
    expect(out?.telemetry.cacheWriteTokens).toBeUndefined();
    expect(out?.telemetry.costUsd).toBe(0.0819455);
  });

  it('keeps the counts out of the human summary line', () => {
    expect(translateStreamJson(RESULT, AT)?.transcript).toBe('— 1 turn · 1.8s · $0.0819');
  });
});
