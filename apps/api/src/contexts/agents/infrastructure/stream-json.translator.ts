import { AgentActivity, AgentTelemetry } from '../domain/model/agent-activity';

export interface Translated {
  activities: AgentActivity[];
  telemetry: Partial<AgentTelemetry>;
  /** What to keep in the raw transcript. `null` drops a line that was pure protocol. */
  transcript: string | null;
}

/**
 * The argument worth showing for each tool, in the order a reader would want it.
 *
 * A tool call's full input is often a whole file; the point of the activity line is to be
 * readable at a glance in a table cell, so each tool contributes exactly one field.
 */
const DETAIL_FIELDS: Record<string, string[]> = {
  Bash: ['command'],
  BashOutput: ['bash_id'],
  Read: ['file_path'],
  Edit: ['file_path'],
  Write: ['file_path'],
  NotebookEdit: ['notebook_path'],
  Grep: ['pattern'],
  Glob: ['pattern'],
  WebFetch: ['url'],
  WebSearch: ['query'],
  Task: ['description'],
  Agent: ['description'],
  Skill: ['skill'],
  TodoWrite: [],
};

const DETAIL_LIMIT = 180;
const TEXT_LIMIT = 400;

function clip(value: unknown, limit: number): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

function detailOf(tool: string, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const preferred = DETAIL_FIELDS[tool];

  if (preferred) {
    for (const field of preferred) {
      if (typeof record[field] === 'string' && record[field]) return clip(record[field], DETAIL_LIMIT);
    }
    // An explicit empty list means this tool has nothing worth showing (TodoWrite).
    if (preferred.length === 0) return undefined;
  }

  // An unknown tool — including every MCP tool, which the console cannot enumerate —
  // still gets a useful line from its first short string argument.
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && value.trim() && value.length < 400) return clip(value, DETAIL_LIMIT);
  }
  return undefined;
}

function contentActivities(content: unknown, at: string): AgentActivity[] {
  if (!Array.isArray(content)) return [];
  const activities: AgentActivity[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (b.type === 'tool_use' && typeof b.name === 'string') {
      activities.push({ at, kind: 'tool', tool: b.name, detail: detailOf(b.name, b.input) });
    } else if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
      activities.push({ at, kind: 'text', text: clip(b.text, TEXT_LIMIT) });
    } else if (b.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
      activities.push({ at, kind: 'thinking', text: clip(b.thinking, TEXT_LIMIT) });
    }
  }
  return activities;
}

/**
 * Turn one line of `--output-format stream-json` into activities and telemetry.
 *
 * Returns `null` for anything that is not a recognisable stream-json event, and the
 * caller then treats the line exactly as it did before. That fallback is the whole
 * contract: the console drives Codex, Cursor and Copilot too, none of which emit this
 * format, and a `claude` entry configured without the flag must keep working. A parser
 * that assumed the format would turn every other agent's output into nothing.
 */
export function translateStreamJson(line: string, at: string): Translated | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    event = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const type = typeof event.type === 'string' ? event.type : '';
  const sessionId = typeof event.session_id === 'string' ? event.session_id : undefined;

  // The final event carries the run's cost and turn count. It is identified by its keys
  // rather than only by `type`, because the cost summary is the one line worth keeping
  // even if a future version renames the type.
  const isResult = type === 'result' || 'total_cost_usd' in event || 'is_error' in event;

  if (isResult) {
    const cost = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null;
    const turns = typeof event.num_turns === 'number' ? event.num_turns : null;
    const duration =
      typeof event.duration_ms === 'number'
        ? event.duration_ms
        : typeof event.duration_api_ms === 'number'
          ? event.duration_api_ms
          : null;
    const parts = [
      turns === null ? null : `${turns} turn${turns === 1 ? '' : 's'}`,
      duration === null ? null : `${(duration / 1000).toFixed(1)}s`,
      cost === null ? null : `$${cost.toFixed(4)}`,
      event.is_error === true ? 'ended in error' : null,
    ].filter(Boolean);
    return {
      activities: parts.length ? [{ at, kind: 'result', text: parts.join(' · ') }] : [],
      telemetry: { costUsd: cost, numTurns: turns, durationMs: duration, ...(sessionId ? { sessionId } : {}) },
      transcript: parts.length ? `— ${parts.join(' · ')}` : null,
    };
  }

  if (type === 'system') {
    return { activities: [], telemetry: sessionId ? { sessionId } : {}, transcript: null };
  }

  if (type === 'assistant' || type === 'user') {
    const message = (event.message ?? {}) as Record<string, unknown>;
    const activities = type === 'assistant' ? contentActivities(message.content, at) : [];
    const model = typeof message.model === 'string' ? message.model : undefined;
    const transcript = activities
      .map((a) => (a.kind === 'tool' ? `→ ${a.tool}${a.detail ? `(${a.detail})` : ''}` : a.text ?? ''))
      .filter(Boolean)
      .join('\n');
    return {
      activities,
      telemetry: { ...(model ? { model } : {}), ...(sessionId ? { sessionId } : {}) },
      transcript: transcript || null,
    };
  }

  // rate_limit_event, stream_event, and anything added later: recognised as protocol,
  // deliberately not shown. Dropping them keeps the transcript readable; the alternative
  // is a wall of JSON that hides the two lines that matter.
  return { activities: [], telemetry: sessionId ? { sessionId } : {}, transcript: null };
}
