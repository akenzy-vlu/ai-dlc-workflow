import { describe, expect, it } from 'vitest';

import { applyFilters, buildFacet } from '../src/contexts/insight/domain/view-filter';

interface Row {
  id: string;
  layer: string;
  status: string;
  repositories: string[];
}

const rows: Row[] = [
  { id: 'a', layer: 'api', status: 'todo', repositories: ['one'] },
  { id: 'b', layer: 'web', status: 'todo', repositories: ['one', 'two'] },
  { id: 'c', layer: 'api', status: 'done', repositories: ['two'] },
];

const read = (row: Row, property: string): string | string[] | null => {
  if (property === 'layer') return row.layer;
  if (property === 'status') return row.status;
  if (property === 'repository') return row.repositories;
  return null;
};

describe('applyFilters', () => {
  it('ORs values inside one filter', () => {
    const result = applyFilters(rows, [{ property: 'layer', operator: 'is', values: ['api', 'web'] }], read);
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('ANDs across different properties', () => {
    // "layer is api, status is todo" is one row, not three. Getting this the other way
    // round produces boards that look empty for no visible reason.
    const result = applyFilters(
      rows,
      [
        { property: 'layer', operator: 'is', values: ['api'] },
        { property: 'status', operator: 'is', values: ['todo'] },
      ],
      read,
    );
    expect(result.map((r) => r.id)).toEqual(['a']);
  });

  it('negates with is-not', () => {
    const result = applyFilters(rows, [{ property: 'layer', operator: 'is-not', values: ['api'] }], read);
    expect(result.map((r) => r.id)).toEqual(['b']);
  });

  it('matches a row that holds the value among several', () => {
    const result = applyFilters(rows, [{ property: 'repository', operator: 'is', values: ['two'] }], read);
    expect(result.map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('ignores a filter with no values selected', () => {
    const result = applyFilters(rows, [{ property: 'layer', operator: 'is', values: [] }], read);
    expect(result).toHaveLength(3);
  });
});

describe('buildFacet', () => {
  it('counts values, most common first', () => {
    const facet = buildFacet(rows, 'layer', 'Layer', (row) => row.layer);
    expect(facet.values).toEqual([
      { value: 'api', label: 'api', count: 2 },
      { value: 'web', label: 'web', count: 1 },
    ]);
  });

  it('counts every value a row holds', () => {
    const facet = buildFacet(rows, 'repository', 'Checkout', (row) => row.repositories);
    expect(facet.values.map((v) => `${v.value}:${v.count}`)).toEqual(['one:2', 'two:2']);
  });

  it('resolves ids into readable labels when given a resolver', () => {
    const facet = buildFacet(rows, 'layer', 'Layer', (row) => row.layer, (v) => v.toUpperCase());
    expect(facet.values.map((v) => v.label)).toEqual(['API', 'WEB']);
  });
});
