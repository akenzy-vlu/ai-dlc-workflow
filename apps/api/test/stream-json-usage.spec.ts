import { describe, expect, it } from 'vitest';

import { translateStreamJson } from '../src/contexts/agents/infrastructure/stream-json.translator';

const AT = '2026-08-28T15:00:00.000Z';

const result = (extra: Record<string, unknown>) =>
  translateStreamJson(
    JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, duration_ms: 1756, total_cost_usd: 0.08, ...extra }),
    AT,
  );

/**
 * Absent is not zero.
 *
 * A `result` with no usage block and a run that genuinely read no cache have to produce
 * different telemetry, or the console reports a paid run as free.
 */
describe('usage counts out of the result event', () => {
  it('reads all four counts', () => {
    const out = result({
      usage: {
        input_tokens: 2,
        output_tokens: 4,
        cache_read_input_tokens: 10_103,
        cache_creation_input_tokens: 7583,
      },
    });

    expect(out?.telemetry.inputTokens).toBe(2);
    expect(out?.telemetry.outputTokens).toBe(4);
    expect(out?.telemetry.cacheReadTokens).toBe(10_103);
    expect(out?.telemetry.cacheWriteTokens).toBe(7583);
  });

  it('patches nothing when the event carries no usage, so the run keeps its nulls', () => {
    // The translator emits a *patch*. Omitting a key is how it says "no news"; the run's
    // own telemetry started every count at null and mergeTelemetry leaves it there.
    const out = result({});

    expect(out?.telemetry.inputTokens).toBeUndefined();
    expect(out?.telemetry.cacheWriteTokens).toBeUndefined();
    // The rest of the summary is unaffected.
    expect(out?.telemetry.costUsd).toBe(0.08);
  });

  it('nulls only the field whose type is wrong', () => {
    // A CLI whose envelope drifts should lose one number, not the whole block.
    const out = result({ usage: { input_tokens: '2', output_tokens: 4, cache_read_input_tokens: 10 } });

    expect(out?.telemetry.inputTokens).toBeNull();
    expect(out?.telemetry.outputTokens).toBe(4);
    expect(out?.telemetry.cacheReadTokens).toBe(10);
    expect(out?.telemetry.cacheWriteTokens).toBeNull();
  });

  it('ignores a usage field that is not an object at all', () => {
    expect(result({ usage: 'lots' })?.telemetry.inputTokens).toBeUndefined();
    expect(result({ usage: [1, 2] })?.telemetry.inputTokens).toBeUndefined();
  });

  it('keeps the human summary line exactly as it was', () => {
    // Four more numbers in that line would bury the two that matter.
    const withUsage = result({ usage: { input_tokens: 2, output_tokens: 4 } });
    const without = result({});

    expect(withUsage?.transcript).toBe(without?.transcript);
    expect(withUsage?.transcript).toBe('— 1 turn · 1.8s · $0.0800');
  });
});
