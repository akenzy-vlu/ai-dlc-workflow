/** Entities are compared by identity. Two tickets with the same id are the same ticket. */
export abstract class Entity<TId extends { equals(o?: unknown): boolean } | string> {
  protected constructor(readonly id: TId) {}

  equals(other?: Entity<TId>): boolean {
    if (!other) return false;
    if (other === this) return true;
    if (typeof this.id === 'string') return this.id === other.id;
    return (this.id as { equals(o?: unknown): boolean }).equals(other.id);
  }
}

/**
 * An aggregate root is the only object outside its own boundary code may hold a
 * reference to. Here: FeaturePlan (planning), ConstructionPlan (construction),
 * GateState (governance), TrackedRepository (portfolio).
 */
export abstract class AggregateRoot<TId extends { equals(o?: unknown): boolean } | string> extends Entity<TId> {}
