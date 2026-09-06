export interface AgentDefinitionModel {
  id: string;
  label: string;
  binary: string;
  available: boolean;
  resolvedPath: string | null;
  promptVia: string;
}

export interface AgentTelemetryModel {
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

export interface AgentActivityModel {
  at: string;
  kind: string;
  tool?: string;
  detail?: string;
  text?: string;
}

export interface AgentRunModel {
  id: string;
  repositoryId: string;
  repositoryLabel: string;
  slug: string;
  ticketId: string;
  agentId: string;
  agentLabel: string;
  launchedBy: string;
  actingAs: string;
  status: string;
  exitCode: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  command: string;
  cwd: string;
  /** The reply text for a reply, the full brief for a first launch. */
  promptPreview: string;
  lineCount: number;
  suggestsSubmit: boolean;
  telemetry: AgentTelemetryModel;
  isResumable: boolean;
  parentRunId: string | null;
  isReply: boolean;
  currentActivity: AgentActivityModel | null;
}

export interface AgentLogLineModel {
  at: string;
  stream: string;
  text: string;
}

export interface AgentRunDetailModel extends AgentRunModel {
  log: AgentLogLineModel[];
}
