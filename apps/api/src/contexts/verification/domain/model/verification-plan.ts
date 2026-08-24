import { AggregateRoot, FeatureRef } from '../../../../shared/kernel';
import { VerificationRung } from './verification-rung';

export interface VerificationEnvironment {
  name: string;
  url: string;
  enabled: boolean;
  /** A required environment that cannot run is what turns a skip into a blocked gate. */
  required: boolean;
  /** True when walking this environment mutates real data. */
  writes: boolean;
  /** `none` | `form` | `clerk-hosted` | `storage-state`. */
  recipe: string;
  /** Credential keys this machine does not have. Non-empty means the env cannot run. */
  missing: string[];
  ready: boolean;
}

export interface VerificationViewport {
  name: string;
  width: number;
  height: number;
  isMobile?: boolean;
  deviceScaleFactor?: number;
}

/**
 * What `verify.py --json` says a run would do, without doing it.
 *
 * Resolved fresh every time rather than cached: it depends on credentials on this
 * machine, and a stale "capable" would invite writing checkboxes into a `uow.md` that
 * the project can never satisfy.
 */
export class VerificationPlan extends AggregateRoot<string> {
  private constructor(
    readonly ref: FeatureRef,
    readonly rung: VerificationRung,
    readonly reason: string,
    readonly errors: readonly string[],
    readonly warnings: readonly string[],
    readonly environments: readonly VerificationEnvironment[],
    readonly viewports: readonly VerificationViewport[],
    readonly stepIds: readonly string[],
    /** Null when ai-dlc-verify is not installed at all. */
    readonly toolAvailable: boolean,
  ) {
    super(ref.key);
  }

  static create(params: {
    ref: FeatureRef;
    rung: VerificationRung;
    reason?: string;
    errors?: string[];
    warnings?: string[];
    environments?: VerificationEnvironment[];
    viewports?: VerificationViewport[];
    stepIds?: string[];
    toolAvailable?: boolean;
  }): VerificationPlan {
    return new VerificationPlan(
      params.ref,
      params.rung,
      params.reason ?? '',
      params.errors ?? [],
      params.warnings ?? [],
      params.environments ?? [],
      params.viewports ?? [],
      params.stepIds ?? [],
      params.toolAvailable ?? true,
    );
  }

  static unavailable(ref: FeatureRef, reason: string): VerificationPlan {
    return VerificationPlan.create({
      ref,
      rung: VerificationRung.create('not applicable'),
      reason,
      toolAvailable: false,
    });
  }

  /**
   * Required environments that are actually holding this feature back.
   *
   * `required: true` in the config is not sufficient on its own: `verify.py` narrows the
   * gating set to the environments this feature's own spec names, so a repo-wide required
   * environment that this feature never walks does not block it. The rung already encodes
   * that judgement, so it is trusted rather than re-derived — otherwise the console shows
   * "capable" and "cannot reach a required environment" side by side, and a reader has no
   * way to know which one to believe.
   */
  get blockedRequiredEnvironments(): VerificationEnvironment[] {
    if (!this.rung.isSkipped) return [];
    return this.environments.filter((e) => e.required && !e.ready);
  }

  /** Configured, unready, but not gating this feature. Worth showing, quietly. */
  get unreadyButNotGating(): VerificationEnvironment[] {
    if (this.rung.isSkipped) return [];
    return this.environments.filter((e) => e.enabled && !e.ready);
  }

  get runnableEnvironments(): VerificationEnvironment[] {
    return this.environments.filter((e) => e.enabled && e.ready);
  }

  /** Environments that mutate real data. Worth a confirmation before a run. */
  get writingEnvironments(): VerificationEnvironment[] {
    return this.environments.filter((e) => e.writes);
  }
}
