import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { agentRepository, portfolioRepository } from '@data/repositories';
import { AgentRunsPageView } from './agent-runs-page.view';

export function AgentRunsPage() {
  // The open transcript lives in the URL so the agents-working pill can link straight to
  // one — that is addressing a thing, which is exactly what a URL is for.
  const [params, setParams] = useSearchParams();
  const repositoryId = params.get('repositoryId') ?? undefined;
  const openRunId = params.get('run');

  const repositories = portfolioRepository.useRepositories();
  const agents = agentRepository.useAgents();
  const runs = agentRepository.useRuns({ repositoryId });

  const { available, unavailable } = useMemo(() => {
    const all = agents.data ?? [];
    return {
      available: all.filter((agent) => agent.available),
      unavailable: all.filter((agent) => !agent.available),
    };
  }, [agents.data]);

  const patchParams = (patch: Record<string, string | undefined>): void => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    setParams(next);
  };

  return (
    <AgentRunsPageView
      runs={runs.data ?? []}
      loading={runs.isLoading}
      fetching={runs.isFetching}
      repositories={repositories.data ?? []}
      repositoryId={repositoryId}
      available={available}
      unavailable={unavailable}
      openRunId={openRunId}
      onRepositoryChange={(value) => patchParams({ repositoryId: value })}
      onRefresh={runs.refetch}
      onOpenRun={(runId) => patchParams({ run: runId })}
      onCloseRun={() => patchParams({ run: undefined })}
    />
  );
}
