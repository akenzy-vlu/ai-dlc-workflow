import type { AgentActivityKind, AgentLogStream, AgentRunStatus } from '../enums';

/** What an agent is doing right now — the answer to "what is it doing?" for a running agent. */
export interface AgentActivity {
  at: string;
  kind: AgentActivityKind;
  /** For `tool`: the tool's name — `Bash`, `Edit`, `Read`. */
  tool?: string;
  /** For `tool`: the one argument worth showing — a command, a path, a pattern. */
  detail?: string;
  /** For `text`, `thinking` and `result`: what it said. */
  text?: string;
}

export interface AgentDefinition {
  id: string;
  label: string;
  binary: string;
  available: boolean;
  resolvedPath: string | null;
  promptVia: 'stdin' | 'arg';
}

/**
 * What the CLI's own stream reported about the run.
 *
 * Every number is nullable and starts null, never 0 — a run that reported nothing and a
 * run that genuinely used no cache have to look different, or the screen tells someone a
 * paid run was free. Only a CLI emitting stream-json reports any of this.
 */
export interface AgentTelemetry {
  /** With it, a finished run can be answered instead of relaunched. */
  sessionId: string | null;
  model: string | null;
  costUsd: number | null;
  numTurns: number | null;
  durationMs: number | null;
  toolCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
}

export interface AgentRun {
  id: string;
  repositoryId: string;
  repositoryLabel: string;
  slug: string;
  ticketId: string;
  agentId: string;
  agentLabel: string;
  /** The person who launched it. */
  launchedBy: string;
  /** The name recorded against the controller transition — the agent's, not the human's. */
  actingAs: string;
  status: AgentRunStatus;
  exitCode: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  command: string;
  cwd: string;
  /** The reply text for a reply, the full brief for a first launch. */
  promptPreview: string;
  lineCount: number;
  /** Finished cleanly. Still not accepted — a person reads the diff. */
  suggestsSubmit: boolean;
  telemetry: AgentTelemetry;
  /** Terminal and carrying a session id: this run can be continued, not just repeated. */
  isResumable: boolean;
  /** The run this one answers, or null for a first launch. */
  parentRunId: string | null;
  isReply: boolean;
  /**
   * The tool the agent is in the middle of, or null once the run has stopped.
   *
   * Read this, never cache the last tool seen — a finished run has no *current* anything,
   * and holding onto its last activity is the kind of stale UI that teaches people not to
   * trust the screen.
   */
  currentActivity: AgentActivity | null;
}

export interface AgentLogLine {
  at: string;
  stream: AgentLogStream;
  text: string;
}

export interface AgentRunDetail extends AgentRun {
  log: AgentLogLine[];
}

export interface LaunchAgentCommand {
  agentId: string;
  launchedBy: string;
  extraInstructions?: string;
  timeoutMinutes?: number;
  /**
   * The caller states plainly that it understands this writes code in a real checkout.
   * The API refuses without it.
   */
  acknowledged: boolean;
}
