import type { AgentLogStream, AgentRunStatus } from '../enums';

export interface AgentDefinition {
  id: string;
  label: string;
  binary: string;
  available: boolean;
  resolvedPath: string | null;
  promptVia: 'stdin' | 'arg';
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
  lineCount: number;
  /** Finished cleanly. Still not accepted — a person reads the diff. */
  suggestsSubmit: boolean;
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
