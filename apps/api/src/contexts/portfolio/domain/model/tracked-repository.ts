import { AggregateRoot, InvalidValueError, RepositoryId } from '../../../../shared/kernel';
import { RepositorySettings } from './repository-settings';

export interface GitMetadata {
  sha: string;
  branch: string;
  /** True when `.ai/` is committed. False means the plans exist on one machine only. */
  aiDirTracked: boolean;
  /** True when `.ai/` has uncommitted changes. */
  aiDirDirty: boolean;
  /** `git remote get-url origin`, or null. The usual signal for project identity. */
  remoteUrl: string | null;
  /** `git rev-parse --git-dir`, absolute. */
  gitDir: string | null;
  /** `git rev-parse --git-common-dir`, absolute. Differs from gitDir in a worktree. */
  commonDir: string | null;
  /** True when this checkout is a linked worktree rather than the primary one. */
  isWorktree: boolean;
}

/**
 * A repository the console watches.
 *
 * The console owns this aggregate — it is the one piece of state that is *not* derived
 * from the plan files, because nothing in a repo says "this repo is on my dashboard".
 * Everything else the console shows is re-derivable by deleting its state and rescanning.
 */
export class TrackedRepository extends AggregateRoot<RepositoryId> {
  private constructor(
    id: RepositoryId,
    private _label: string,
    readonly absolutePath: string,
    private _settings: RepositorySettings,
    private _git: GitMetadata | null,
    readonly addedAt: Date,
    private _lastScannedAt: Date | null,
    private _projectOverride: string | null,
  ) {
    super(id);
  }

  static register(params: {
    id: RepositoryId;
    label: string;
    absolutePath: string;
    addedAt?: Date;
  }): TrackedRepository {
    if (!params.absolutePath.startsWith('/')) {
      throw new InvalidValueError(`repository path must be absolute, got "${params.absolutePath}"`);
    }
    const label = params.label.trim();
    if (!label) throw new InvalidValueError('repository label must not be empty');
    return new TrackedRepository(
      params.id,
      label,
      params.absolutePath,
      RepositorySettings.unconfigured(),
      null,
      params.addedAt ?? new Date(),
      null,
      null,
    );
  }

  static rehydrate(params: {
    id: RepositoryId;
    label: string;
    absolutePath: string;
    settings: RepositorySettings;
    git: GitMetadata | null;
    addedAt: Date;
    lastScannedAt: Date | null;
    projectOverride?: string | null;
  }): TrackedRepository {
    return new TrackedRepository(
      params.id,
      params.label,
      params.absolutePath,
      params.settings,
      params.git,
      params.addedAt,
      params.lastScannedAt,
      params.projectOverride ?? null,
    );
  }

  get label(): string {
    return this._label;
  }
  get settings(): RepositorySettings {
    return this._settings;
  }
  get git(): GitMetadata | null {
    return this._git;
  }
  get lastScannedAt(): Date | null {
    return this._lastScannedAt;
  }

  /**
   * A project this checkout belongs to, stated rather than derived.
   *
   * Set it when the automatic grouping is wrong in either direction: two clones with
   * different remotes that are really one project, or two sharing a remote that are
   * genuinely managed apart. Null means "work it out from git".
   */
  get projectOverride(): string | null {
    return this._projectOverride;
  }

  assignToProject(project: string | null): void {
    const next = project?.trim() ?? '';
    this._projectOverride = next.length > 0 ? next : null;
  }

  /** Where this repo's plans live. Every path the console reads hangs off here. */
  get aiDirectory(): string {
    return `${this.absolutePath}/.ai`;
  }
  get featuresDirectory(): string {
    return `${this.aiDirectory}/features`;
  }
  get architectureMapPath(): string {
    return `${this.aiDirectory}/architecture.md`;
  }

  rename(label: string): void {
    const next = label.trim();
    if (!next) throw new InvalidValueError('repository label must not be empty');
    this._label = next;
  }

  /** Applied after a scan. Settings and git state are observations, never commands. */
  observe(settings: RepositorySettings, git: GitMetadata | null, at: Date = new Date()): void {
    this._settings = settings;
    this._git = git;
    this._lastScannedAt = at;
  }

  /**
   * Plans that live nowhere but this machine. Multica calls the equivalent "LOCAL ONLY";
   * it is the single most alarming thing the portfolio can tell you, because losing the
   * laptop loses the approval trail with it.
   */
  get plansAreLocalOnly(): boolean {
    return this._git !== null && !this._git.aiDirTracked;
  }
}
