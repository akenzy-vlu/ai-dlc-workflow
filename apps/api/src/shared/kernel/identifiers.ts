import { InvalidValueError } from './domain-error';
import { ValueObject } from './value-object';

const SLUG = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * Identity of a tracked repository inside the console. Deliberately console-local:
 * the plan files know nothing about it, so it can be re-derived from the path.
 */
export class RepositoryId extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): RepositoryId {
    const v = (value ?? '').trim();
    if (!SLUG.test(v)) throw new InvalidValueError(`repository id must be slug-shaped, got "${value}"`);
    return new RepositoryId(v);
  }
  get value(): string {
    return this.props;
  }
  toString(): string {
    return this.props;
  }
}

/** The directory name under `.ai/features/`. This is the feature's identity on disk. */
export class FeatureSlug extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): FeatureSlug {
    const v = (value ?? '').trim();
    if (!v) throw new InvalidValueError('feature slug must not be empty');
    if (v.includes('/') || v.includes('..')) {
      throw new InvalidValueError(`feature slug must not traverse paths, got "${value}"`);
    }
    return new FeatureSlug(v);
  }
  get value(): string {
    return this.props;
  }
  toString(): string {
    return this.props;
  }
}

/**
 * A feature's identity across every bounded context: which repository, which slug.
 *
 * Planning, construction and governance each model a *different aspect* of the same
 * feature. This ref is the shared-kernel handle they agree on; none of them shares its
 * aggregate with the others.
 */
export class FeatureRef extends ValueObject<{ repositoryId: string; slug: string }> {
  private constructor(repositoryId: string, slug: string) {
    super({ repositoryId, slug });
  }
  static create(repositoryId: RepositoryId | string, slug: FeatureSlug | string): FeatureRef {
    const rid = repositoryId instanceof RepositoryId ? repositoryId : RepositoryId.create(repositoryId);
    const s = slug instanceof FeatureSlug ? slug : FeatureSlug.create(slug);
    return new FeatureRef(rid.value, s.value);
  }
  get repositoryId(): RepositoryId {
    return RepositoryId.create(this.props.repositoryId);
  }
  get slug(): FeatureSlug {
    return FeatureSlug.create(this.props.slug);
  }
  get key(): string {
    return `${this.props.repositoryId}/${this.props.slug}`;
  }
  toString(): string {
    return this.key;
  }
}

/** `UOW-01`. Case-normalised because the files are hand-written. */
export class UowId extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): UowId {
    const v = (value ?? '').trim().toUpperCase();
    if (!/^UOW-\S+$/.test(v)) throw new InvalidValueError(`not a UoW id: "${value}"`);
    return new UowId(v);
  }
  static tryCreate(value: string): UowId | null {
    try {
      return UowId.create(value);
    } catch {
      return null;
    }
  }
  get value(): string {
    return this.props;
  }
  toString(): string {
    return this.props;
  }
}

/** `T-01-03`. */
export class TicketId extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): TicketId {
    const v = (value ?? '').trim().toUpperCase();
    if (!/^T-\S+$/.test(v)) throw new InvalidValueError(`not a ticket id: "${value}"`);
    return new TicketId(v);
  }
  static tryCreate(value: string): TicketId | null {
    try {
      return TicketId.create(value);
    } catch {
      return null;
    }
  }
  get value(): string {
    return this.props;
  }
  toString(): string {
    return this.props;
  }
}
