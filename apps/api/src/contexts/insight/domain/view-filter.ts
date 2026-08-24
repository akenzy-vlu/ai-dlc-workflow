/**
 * A filter is a property, an operator and a set of values.
 *
 * Modelled after the shape every issue tracker converges on, and for the same reason:
 * `layer is api or web` is a thing people say, and free-text search is not a substitute
 * for it. Only `is` and `is not` exist — ranges and comparisons need their own operators
 * and their own UI, and adding them speculatively would leave half-built affordances.
 */
export type FilterOperator = 'is' | 'is-not';

export interface ViewFilter {
  property: string;
  operator: FilterOperator;
  values: string[];
}

/** One selectable value on a filterable property, with how many rows carry it. */
export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export interface Facet {
  property: string;
  label: string;
  values: FacetValue[];
}

/**
 * Applies filters to rows.
 *
 * Filters on *different* properties are ANDed; values within one filter are ORed. That is
 * what "status is todo or review, layer is api" means when someone says it out loud, and
 * getting it the other way round produces empty boards that look like bugs.
 */
export function applyFilters<T>(
  rows: readonly T[],
  filters: readonly ViewFilter[],
  read: (row: T, property: string) => string | string[] | null,
): T[] {
  const active = filters.filter((f) => f.values.length > 0);
  if (active.length === 0) return [...rows];

  return rows.filter((row) =>
    active.every((filter) => {
      const raw = read(row, filter.property);
      const held = raw === null ? [] : Array.isArray(raw) ? raw : [raw];
      const matches = held.some((value) => filter.values.includes(value));
      return filter.operator === 'is' ? matches : !matches;
    }),
  );
}

/** Counts distinct values of one property across rows, most common first. */
export function buildFacet<T>(
  rows: readonly T[],
  property: string,
  label: string,
  read: (row: T) => string | string[] | null,
  labelOf: (value: string) => string = (v) => v,
): Facet {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = read(row);
    const values = raw === null ? [] : Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return {
    property,
    label,
    values: [...counts.entries()]
      .map(([value, count]) => ({ value, label: labelOf(value), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}
