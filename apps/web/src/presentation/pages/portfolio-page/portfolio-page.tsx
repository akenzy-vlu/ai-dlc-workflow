import { useMemo, useState } from 'react';

import { portfolioRepository, preferencesRepository } from '@data/repositories';
import type { FeatureSummary } from '@domain/entities';
import { applyFilters, buildFacet, groupRows, toggleFilterValue, type Facet } from '@domain/value-objects';
import {
  PORTFOLIO_DEFAULTS,
  PORTFOLIO_VIEW_KEY,
  laneOf,
  readProperty,
  sortRows,
} from './portfolio-page.model';
import { PortfolioPageView } from './portfolio-page.view';

export function PortfolioPage() {
  const [search, setSearch] = useState('');
  const view = preferencesRepository.useViewState(PORTFOLIO_VIEW_KEY, { display: PORTFOLIO_DEFAULTS });
  const portfolio = portfolioRepository.usePortfolio();
  const tooling = portfolioRepository.useTooling();

  const allRows = useMemo(() => portfolio.data?.rows ?? [], [portfolio.data]);

  // Facets come off the unfiltered rows so a value never disappears from the picker the
  // moment you select it and nothing else matches.
  const facets = useMemo<Facet[]>(
    () =>
      (
        [
          ['project', 'Project'],
          ['repository', 'Checkout'],
          ['branch', 'Branch'],
          ['gate', 'Gate'],
          ['profile', 'Profile'],
        ] as const
      )
        .map(([property, label]) =>
          buildFacet(allRows, property, label, (row) => readProperty(row, property)),
        )
        .filter((facet) => facet.values.length > 1),
    [allRows],
  );

  const rows = useMemo<FeatureSummary[]>(() => {
    const term = search.trim().toLowerCase();
    const searched = term
      ? allRows.filter((row) =>
          `${row.repositoryLabel} ${row.projectLabel} ${row.slug}`.toLowerCase().includes(term),
        )
      : allRows;
    return sortRows(applyFilters(searched, view.filters, readProperty), view.display.orderBy);
  }, [allRows, search, view.filters, view.display.orderBy]);

  const groups = useMemo(
    () => (view.display.groupBy === 'none' ? [] : groupRows(rows, view.display.groupBy, laneOf)),
    [rows, view.display.groupBy],
  );

  return (
    <PortfolioPageView
      portfolio={portfolio.data}
      rows={rows}
      groups={groups}
      facets={facets}
      filters={view.filters}
      display={view.display}
      isCustomised={view.isCustomised}
      loading={portfolio.isLoading}
      fetching={portfolio.isFetching}
      search={search}
      expectedRuleset={tooling.data?.ruleset ?? null}
      onSearchChange={setSearch}
      onFiltersChange={view.setFilters}
      onDisplayChange={view.setDisplay}
      onResetView={view.reset}
      onRefresh={portfolio.refetch}
      // The gate histogram is a shortcut into the same filter state, not a rival to it.
      onToggleGate={(gate) => view.setFilters(toggleFilterValue(view.filters, 'gate', gate))}
    />
  );
}
