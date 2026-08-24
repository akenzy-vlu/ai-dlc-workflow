import type { AgentDefinition, AgentRun, AgentRunDetail, LaunchAgentCommand } from '../entities';
import type { FeatureRef } from '../value-objects';
import type { CommandResult, QueryResult } from './query.types';

/**
 * Handing a ticket to an agent CLI, and watching what it does.
 *
 * The order on the other side is not incidental: the controller is asked to move the
 * ticket to `in_progress` under the agent's name *before* anything spawns, so an agent is
 * subject to the same gates as a person.
 */
export interface AgentRepository {
  useAgents(): QueryResult<AgentDefinition[]>;
  useRuns(params?: {
    repositoryId?: string;
    slug?: string;
    ticketId?: string;
    active?: boolean;
  }): QueryResult<AgentRun[]>;
  useRun(runId: string | null): QueryResult<AgentRunDetail>;
  /** The brief an agent would be handed. Worth reading before a launch. */
  useBriefing(ref: FeatureRef | null, ticketId: string | null): QueryResult<{ briefing: string }>;

  useLaunch(): CommandResult<FeatureRef & { ticketId: string } & LaunchAgentCommand, { runId: string }>;
  /**
   * Launches an agent for every pickable ticket in the feature at once.
   *
   * The server decides which those are — dependencies met, not already running, and no
   * write conflict with another launched ticket. `skipped` says what it held back and why.
   */
  useLaunchReady(): CommandResult<
    {
      repositoryId: string;
      slug: string;
      agentId: string;
      launchedBy: string;
      extraInstructions?: string;
      timeoutMinutes?: number;
      acknowledged: boolean;
    },
    { launched: { ticketId: string; runId: string }[]; skipped: { ticketId: string; reason: string }[] }
  >;
  useCancel(): CommandResult<string, { cancelled: boolean }>;
}
