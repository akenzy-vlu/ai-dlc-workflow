import { AgentActivity, AgentTelemetry } from '../model/agent-activity';
import { AgentDefinition } from '../model/agent-definition';
import { AgentRun, LogLine } from '../model/agent-run';

export const AGENT_CATALOG = Symbol('AGENT_CATALOG');
export const AGENT_PROCESS = Symbol('AGENT_PROCESS');
export const AGENT_RUN_STORE = Symbol('AGENT_RUN_STORE');

/** Which agent CLIs exist on this machine. */
export interface AgentCatalogPort {
  list(): Promise<AgentDefinition[]>;
  find(id: string): Promise<AgentDefinition | null>;
}

export interface LaunchRequest {
  run: AgentRun;
  definition: AgentDefinition;
  prompt: string;
  timeoutMs: number;
  onLine: (line: LogLine) => void;
  /** Structured events, when the CLI emits them. Silent for CLIs that print prose. */
  onActivity: (activity: AgentActivity) => void;
  onTelemetry: (patch: Partial<AgentTelemetry>) => void;
}

/** Spawns and cancels agent processes. The only thing here that executes anything. */
export interface AgentProcessPort {
  launch(request: LaunchRequest): Promise<{ command: string; exitCode: number; cancelled: boolean }>;
  cancel(runId: string): boolean;
  isRunning(runId: string): boolean;
}

export interface AgentRunStorePort {
  save(run: AgentRun): Promise<void>;
  find(id: string): Promise<AgentRun | null>;
  list(filter?: { repositoryId?: string; slug?: string; ticketId?: string; active?: boolean }): Promise<AgentRun[]>;
}
