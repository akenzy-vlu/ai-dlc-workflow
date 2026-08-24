import type { AgentRun } from '@domain/entities';

export interface AgentsWorkingPillProps {
  runs: AgentRun[];
}

export type AgentsWorkingPillViewProps = AgentsWorkingPillProps;
