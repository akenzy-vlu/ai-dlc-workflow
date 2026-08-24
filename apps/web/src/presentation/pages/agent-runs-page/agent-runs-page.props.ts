import type { AgentDefinition, AgentRun, Repository } from '@domain/entities';

export interface AgentRunsPageViewProps {
  runs: AgentRun[];
  loading: boolean;
  fetching: boolean;
  repositories: Repository[];
  repositoryId: string | undefined;
  available: AgentDefinition[];
  unavailable: AgentDefinition[];
  openRunId: string | null;
  onRepositoryChange: (repositoryId: string | undefined) => void;
  onRefresh: () => void;
  onOpenRun: (runId: string) => void;
  onCloseRun: () => void;
}
