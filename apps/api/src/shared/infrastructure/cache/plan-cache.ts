interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Time-boxed memo for parsed plans, keyed by feature directory.
 *
 * Reading the portfolio means parsing ~2000 ticket files across ~120 features; doing that
 * per request makes the console feel broken. Entries are dropped on a TTL *and* punched
 * out by the filesystem watcher, so a plan edited in an editor shows up without a manual
 * refresh — and a stale entry can never outlive the TTL even if the watcher misses it.
 */
export class PlanCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly ttlMs: number) {}

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    const value = await load();
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  /** Drops every key at or under `prefix`. A feature edit invalidates its own subtree. */
  invalidate(prefix: string): number {
    let dropped = 0;
    for (const key of this.entries.keys()) {
      if (key === prefix || key.startsWith(prefix)) {
        this.entries.delete(key);
        dropped++;
      }
    }
    return dropped;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
