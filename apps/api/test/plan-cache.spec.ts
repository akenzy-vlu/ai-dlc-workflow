import { describe, expect, it } from 'vitest';

import { PlanCache } from '../src/shared/infrastructure/cache/plan-cache';

/**
 * The contract every PlanCachePort implementation has to meet.
 *
 * The first test is the one that matters and the one that was missing: a cached
 * `FeatureSnapshot` holds live aggregates, so an implementation that serialises returns
 * prototype-less objects on a hit. That shipped once — the first request succeeded and
 * the second died with "construction.graph.criticalPath is not a function" — because
 * nothing asserted that what comes out of the cache is still what went in.
 */
describe('plan cache', () => {
  class Graph {
    constructor(private readonly ids: string[]) {}
    criticalPath(): { ticketIds: string[] } {
      return { ticketIds: this.ids };
    }
  }

  const snapshot = () => ({
    repository: { id: { value: 'repo-1' } },
    construction: { graph: new Graph(['T-01-01']) },
    observedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  it('returns the value it was given, methods and all', async () => {
    const cache = new PlanCache(60_000);
    const key = 'repo-1/some-feature';

    const first = await cache.get(key, async () => snapshot());
    const second = await cache.get(key, async () => {
      throw new Error('loader must not run on a hit');
    });

    // A hit has to be usable exactly like a miss. Both halves of the shipped bug:
    expect(typeof second.construction.graph.criticalPath).toBe('function');
    expect(second.construction.graph.criticalPath().ticketIds).toEqual(['T-01-01']);
    expect(second.repository.id.value).toBe('repo-1');
    expect(second.observedAt).toBeInstanceOf(Date);
    expect(second).toBe(first);
  });

  it('loads once and reuses the result', async () => {
    const cache = new PlanCache(60_000);
    let loads = 0;
    const load = async () => {
      loads++;
      return snapshot();
    };

    await cache.get('k', load);
    await cache.get('k', load);
    expect(loads).toBe(1);
  });

  it('drops a whole repository subtree by prefix', async () => {
    const cache = new PlanCache(60_000);
    await cache.get('repo-1/a', async () => snapshot());
    await cache.get('repo-1/b', async () => snapshot());
    await cache.get('repo-2/a', async () => snapshot());

    expect(cache.invalidate('repo-1/')).toBe(2);
    expect(cache.size).toBe(1);
  });

  it('drops one feature without touching its siblings', async () => {
    const cache = new PlanCache(60_000);
    await cache.get('repo-1/a', async () => snapshot());
    await cache.get('repo-1/b', async () => snapshot());

    expect(cache.invalidate('repo-1/a')).toBe(1);
    expect(cache.size).toBe(1);
  });

  it('re-loads once the entry has expired', async () => {
    const cache = new PlanCache(0);
    let loads = 0;
    const load = async () => {
      loads++;
      return snapshot();
    };

    await cache.get('k', load);
    await cache.get('k', load);
    // A zero TTL means every entry is already stale, so the loader runs again.
    expect(loads).toBe(2);
  });
});
