import type { FeatureSummary, Portfolio } from '@domain/entities';
import type { DisplayOptions, Facet, Grouped, ViewFilter } from '@domain/value-objects';

export interface PortfolioPageViewProps {
  portfolio: Portfolio | undefined;
  rows: FeatureSummary[];
  groups: Grouped<FeatureSummary>[];
  facets: Facet[];
  filters: ViewFilter[];
  display: DisplayOptions;
  isCustomised: boolean;
  loading: boolean;
  fetching: boolean;
  search: string;
  expectedRuleset: number | null;
  onSearchChange: (value: string) => void;
  onFiltersChange: (filters: ViewFilter[]) => void;
  onDisplayChange: (patch: Partial<DisplayOptions>) => void;
  onResetView: () => void;
  onToggleGate: (gate: string) => void;
  onRefresh: () => void;
}
