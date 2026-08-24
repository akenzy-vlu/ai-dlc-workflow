import { Gate } from '../../../../shared/kernel';

export interface GateFinding {
  level: 'ok' | 'fail';
  message: string;
}

/**
 * The result of `aidlc check <gate>` — the controller's own verdict, parsed but never
 * re-derived.
 *
 * The console deliberately does not reimplement `check_gN`. It could: the rules are
 * readable and most are cheap. But then two programs would decide what a gate means, and
 * the day they disagree the console becomes the one people believe, because it is the one
 * with the green badge. Delegating keeps exactly one enforcement point.
 */
export class GateVerdict {
  private constructor(
    readonly gate: Gate,
    readonly passed: boolean,
    readonly findings: readonly GateFinding[],
    readonly checkedAt: Date,
    /** Non-null when the controller itself could not run — not a failing gate. */
    readonly error: string | null,
  ) {}

  static create(params: {
    gate: Gate;
    passed: boolean;
    findings: GateFinding[];
    checkedAt?: Date;
    error?: string | null;
  }): GateVerdict {
    return new GateVerdict(
      params.gate,
      params.passed,
      params.findings,
      params.checkedAt ?? new Date(),
      params.error ?? null,
    );
  }

  static unavailable(gate: Gate, error: string): GateVerdict {
    return new GateVerdict(gate, false, [], new Date(), error);
  }

  get blockers(): GateFinding[] {
    return this.findings.filter((f) => f.level === 'fail');
  }

  get satisfied(): GateFinding[] {
    return this.findings.filter((f) => f.level === 'ok');
  }

  /** True when the gate would pass right now and only a human's name is missing. */
  get isReadyToApprove(): boolean {
    return this.passed && this.error === null;
  }
}
