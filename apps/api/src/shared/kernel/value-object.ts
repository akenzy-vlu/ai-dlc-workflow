/**
 * Value objects are compared by their props, never by identity, and are frozen on
 * construction. Subclasses validate in their factory (`create`), never in a public
 * constructor — an instance that exists is an instance that is valid.
 */
export abstract class ValueObject<T extends object | string | number> {
  protected constructor(protected readonly props: T) {
    Object.freeze(this);
  }

  equals(other?: ValueObject<T>): boolean {
    if (other === null || other === undefined) return false;
    if (other.constructor !== this.constructor) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
