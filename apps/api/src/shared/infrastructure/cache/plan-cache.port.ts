export const PLAN_CACHE = Symbol('PLAN_CACHE');

/**
 * The memo in front of plan parsing.
 *
 * An interface because the backing store is a deployment choice: in-process for a laptop,
 * Redis once more than one API replica exists — at which point an in-process cache means
 * a plan edited through one replica stays stale on the others until their TTLs lapse.
 */
export interface PlanCachePort {
  get<T>(key: string, load: () => Promise<T>): Promise<T>;
  /** Drops every key at or under `prefix`. Returns how many went. */
  invalidate(prefix: string): Promise<number> | number;
  clear(): Promise<void> | void;
}
