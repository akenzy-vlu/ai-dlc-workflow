import { useMemo } from 'react';

import type { FilterOperator, ViewFilter } from '@domain/value-objects';
import type { FilterControlProps } from './filter-control.props';
import { FilterControlView } from './filter-control.view';

export function FilterControl({ facets, filters, onChange }: FilterControlProps) {
  const active = useMemo(
    () =>
      filters
        .filter((filter) => filter.values.length > 0)
        .map((filter) => ({
          filter,
          facet: facets.find((facet) => facet.property === filter.property),
        }))
        .filter((pair): pair is { filter: ViewFilter; facet: NonNullable<typeof pair.facet> } =>
          Boolean(pair.facet),
        ),
    [filters, facets],
  );

  const used = new Set(active.map((pair) => pair.filter.property));
  const available = facets.filter((facet) => !used.has(facet.property));

  const setValues = (property: string, values: string[]): void => {
    const existing = filters.find((filter) => filter.property === property);
    const next = existing
      ? filters.map((filter) => (filter.property === property ? { ...filter, values } : filter))
      : [...filters, { property, operator: 'is' as FilterOperator, values }];
    onChange(next.filter((filter) => filter.values.length > 0));
  };

  return (
    <FilterControlView
      active={active}
      available={available}
      onOperatorChange={(property, operator) =>
        onChange(filters.map((filter) => (filter.property === property ? { ...filter, operator } : filter)))
      }
      onValuesChange={setValues}
      onRemove={(property) => onChange(filters.filter((filter) => filter.property !== property))}
      onClear={() => onChange([])}
    />
  );
}
