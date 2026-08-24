import type { Facet, FilterOperator, ViewFilter } from '@domain/value-objects';

export interface FilterControlProps {
  facets: Facet[];
  filters: ViewFilter[];
  onChange: (filters: ViewFilter[]) => void;
}

export interface FilterControlViewProps {
  /** Filters that actually narrow anything, paired with the facet describing them. */
  active: { filter: ViewFilter; facet: Facet }[];
  available: Facet[];
  onOperatorChange: (property: string, operator: FilterOperator) => void;
  onValuesChange: (property: string, values: string[]) => void;
  onRemove: (property: string) => void;
  onClear: () => void;
}
