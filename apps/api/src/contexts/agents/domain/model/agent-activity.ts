/**
 * What an agent is doing right now, and what the run cost.
 *
 * An agent CLI in text mode prints nothing until it exits, so a running agent is a black
 * box: the console can say "running" for twenty minutes and nothing more. Claude Code's
 * `--output-format stream-json` emits one JSON object per event instead, and a `tool_use`
 * block in it is the answer to the only question anyone actually asks of a running agent —
 * *what is it doing?*
 *
 * This is a console concern, not a plan concern. AI-DLC records that a ticket changed
 * state and who changed it; that stays the durable record. This is the observation behind
 * it, and it is disposable.
 */
export interface AgentActivity {
  at: string;
  kind: 'tool' | 'text' | 'thinking' | 'result';
  /** For `tool`: the tool's name — `Bash`, `Edit`, `Read`. */
  tool?: string;
  /** For `tool`: the one argument worth showing — a command, a path, a pattern. */
  detail?: string;
  /** For `text`, `thinking` and `result`: what it said. */
  text?: string;
}

/**
 * What the stream reports about the run itself.
 *
 * `sessionId` is the one that changes behaviour rather than just the display: with it, a
 * rejected ticket can be handed back to the *same conversation* (`claude -p --resume`)
 * instead of one that has to be told everything again.
 */
export interface AgentTelemetry {
  sessionId: string | null;
  model: string | null;
  costUsd: number | null;
  numTurns: number | null;
  durationMs: number | null;
  toolCalls: number;
}

export function emptyTelemetry(): AgentTelemetry {
  return { sessionId: null, model: null, costUsd: null, numTurns: null, durationMs: null, toolCalls: 0 };
}

/** One line of a tool activity, for a table cell or a pill. */
export function describeActivity(activity: AgentActivity): string {
  if (activity.kind !== 'tool') return (activity.text ?? '').slice(0, 120);
  return activity.detail ? `${activity.tool} — ${activity.detail}` : (activity.tool ?? 'tool');
}
