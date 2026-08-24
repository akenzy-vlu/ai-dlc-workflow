export interface AgentDefinitionModel {
  id: string;
  label: string;
  binary: string;
  available: boolean;
  resolvedPath: string | null;
  promptVia: string;
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
  lineCount: number;
  suggestsSubmit: boolean;
}

export interface AgentLogLineModel {
  at: string;
  stream: string;
  text: string;
}

export interface AgentRunDetailModel extends AgentRunModel {
  log: AgentLogLineModel[];
}
