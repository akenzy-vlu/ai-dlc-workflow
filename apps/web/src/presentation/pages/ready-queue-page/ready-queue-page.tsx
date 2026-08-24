import { useMemo, useState } from 'react';

import { insightRepository, portfolioRepository } from '@data/repositories';
import { sumHours } from '@domain/value-objects';
import type { ReadyQueueFilters } from './ready-queue-page.props';
import { ReadyQueuePageView } from './ready-queue-page.view';

export function ReadyQueuePage() {
  const [filters, setFilters] = useState<ReadyQueueFilters>({});

  const repositories = portfolioRepository.useRepositories();
  const queue = insightRepository.useReadyQueue({
    repositoryId: filters.repositoryId,
    layer: filters.layer,
    type: filters.type,
    maxHours: filters.maxHours ?? undefined,
  });

  const rows = useMemo(() => queue.data ?? [], [queue.data]);
  const layers = useMemo(() => [...new Set(rows.map((row) => row.layer))].sort(), [rows]);
  const types = useMemo(() => [...new Set(rows.map((row) => row.type))].sort(), [rows]);

  return (
    <ReadyQueuePageView
      rows={rows}
      loading={queue.isLoading}
      fetching={queue.isFetching}
      repositories={repositories.data ?? []}
      layers={layers}
      types={types}
      filters={filters}
      totalHours={sumHours(rows, (row) => row.estimateHours)}
      onFilterChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
      onRefresh={queue.refetch}
    />
  );
}
