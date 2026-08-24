import { ValueObject } from '../../../../shared/kernel';

/**
 * Which rung `verify.py resolve()` put this project on. The strings match the Python
 * constants exactly, because they arrive over `--json`.
 */
export const RUNGS = ['not applicable', 'skipped', 'capable', 'config error'] as const;
export type RungValue = (typeof RUNGS)[number];

/**
 * ai-dlc-verify is installed globally and meets projects that have no login, no staging
 * environment, and no credentials on this machine. A verification tool that fails loudly
 * in those cases gets disabled, and a disabled gate is worse than an absent one — so the
 * ladder degrades on purpose, with exactly one exception.
 *
 * `config error` must never soften into `skipped`. A contradiction in `.ai/aidlc.yaml`
 * (`required: true` with `enabled: false`, an unknown recipe, a spec naming an undefined
 * environment) means a required environment would be silently dropped, and silently
 * dropping a required environment is the failure this package exists to prevent.
 */
export class VerificationRung extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string | undefined): VerificationRung {
    const v = (value ?? '').trim().toLowerCase();
    return new VerificationRung((RUNGS as readonly string[]).includes(v) ? v : 'not applicable');
  }

  get value(): RungValue {
    return this.props as RungValue;
  }

  /** The only rung on which evidence may be written into `uow.md`. */
  get canRun(): boolean {
    return this.props === 'capable';
  }

  /** A contradiction the project must fix. Not the same as "nothing to do". */
  get isConfigError(): boolean {
    return this.props === 'config error';
  }

  /** Configured, but this machine cannot run it — missing credentials, usually. */
  get isSkipped(): boolean {
    return this.props === 'skipped';
  }

  get isNotApplicable(): boolean {
    return this.props === 'not applicable';
  }

  toString(): string {
    return this.props;
  }
}
