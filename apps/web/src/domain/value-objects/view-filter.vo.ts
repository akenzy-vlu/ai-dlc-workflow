/**
 * A filter is a property, an operator and a set of values.
 *
 * Only `is` and `is not` exist. Ranges and comparisons need their own operators and their
 * own controls, and adding them speculatively leaves half-built affordances in the UI.
 */
export type FilterOperator = 'is' | 'is-not';

export interface ViewFilter {
  property: string;
  operator: FilterOperator;
  values: string[];
}

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
 * Values inside one filter are ORed; filters on different properties are ANDed.
 *
 * That is what "status is todo or review, layer is api" means said out loud. Getting it
 * the other way round produces empty boards that look like bugs.
 */
export function applyFilters<T>(
  rows: readonly T[],
  filters: readonly ViewFilter[],
  read: (row: T, property: string) => string | string[] | null,
): T[] {
  const active = filters.filter((filter) => filter.values.length > 0);
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
  labelOf: (value: string) => string = (value) => value,
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

/** Toggles one value of one property without disturbing the others. */
export function toggleFilterValue(
  filters: readonly ViewFilter[],
  property: string,
  value: string,
): ViewFilter[] {
  const existing = filters.find((filter) => filter.property === property);
  const already = existing?.values.includes(value) ?? false;
  const values = already
    ? existing!.values.filter((held) => held !== value)
    : [...(existing?.values ?? []), value];
  const others = filters.filter((filter) => filter.property !== property);
  return values.length > 0 ? [...others, { property, operator: 'is', values }] : others;
}
