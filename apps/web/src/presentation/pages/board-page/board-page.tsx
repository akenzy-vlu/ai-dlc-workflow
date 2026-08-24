import { useMemo, useState } from 'react';

import { agentRepository, insightRepository, portfolioRepository, preferencesRepository } from '@data/repositories';
import type { AgentRun, BoardCard } from '@domain/entities';
import { groupRows } from '@domain/value-objects';
import { BOARD_COLUMNS, BOARD_DEFAULTS, BOARD_VIEW_KEY, laneOf, runKey } from './board-page.model';
import { BoardPageView } from './board-page.view';

export function BoardPage() {
  const view = preferencesRepository.useViewState(BOARD_VIEW_KEY, {
    display: BOARD_DEFAULTS,
    scope: 'all',
  });
  const [launchFor, setLaunchFor] = useState<BoardCard | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const projects = portfolioRepository.useProjects();
  const board = insightRepository.useBoard({
    scope: view.scope,
    filters: view.filters,
    mergeCheckouts: view.display.mergeCheckouts,
  });
  const runs = agentRepository.useRuns();

  // Latest run per ticket. A ticket can be handed to an agent more than once — a failed
  // run then a retry — and the newest is the one whose transcript anyone wants.
  const runsByTicket = useMemo(() => {
    const map = new Map<string, AgentRun>();
    for (const run of runs.data ?? []) {
      const key = runKey({ repositoryId: run.repositoryId, featureSlug: run.slug, ticketId: run.ticketId });
      const existing = map.get(key);
      if (!existing || run.createdAt > existing.createdAt) map.set(key, run);
    }
    return map;
  }, [runs.data]);

  const columns = useMemo(
    () => BOARD_COLUMNS.filter((column) => !(view.display.hideCompleted && column.status === 'done')),
    [view.display.hideCompleted],
  );

  const lanes = useMemo(
    () => groupRows(board.data?.cards ?? [], view.display.groupBy, laneOf),
    [board.data?.cards, view.display.groupBy],
  );

  return (
    <BoardPageView
      board={board.data}
      lanes={lanes}
      columns={columns}
      projects={projects.data ?? []}
      projectsLoading={projects.isLoading}
      scope={view.scope}
      filters={view.filters}
      display={view.display}
      isCustomised={view.isCustomised}
      loading={board.isLoading}
      fetching={board.isFetching}
      launchFor={launchFor}
      openRunId={openRunId}
      runFor={(card) => runsByTicket.get(runKey(card))}
      onScopeChange={view.setScope}
      onFiltersChange={view.setFilters}
      onDisplayChange={view.setDisplay}
      onResetView={view.reset}
      onRefresh={board.refetch}
      onLaunch={setLaunchFor}
      onOpenRun={setOpenRunId}
    />
  );
}
