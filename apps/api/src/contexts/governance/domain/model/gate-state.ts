import { AggregateRoot, FeatureRef, Gate } from '../../../../shared/kernel';
import { AuditEntry } from './audit-entry';

/**
 * `.aidlc-state.yaml` for one feature: where it stands, and everything that got it there.
 *
 * `managed: false` is a first-class state, not an error. Roughly a third of the feature
 * directories in a real portfolio have no state file — they were scaffolded by hand or
 * started before the controller. They are legitimate plans; they simply have no gate, and
 * a console that hid them would hide the largest cleanup job in the portfolio.
 */
export class GateState extends AggregateRoot<string> {
  private constructor(
    readonly ref: FeatureRef,
    readonly managed: boolean,
    readonly currentGate: Gate,
    readonly profile: string,
    readonly createdAt: Date | null,
    readonly history: readonly AuditEntry[],
  ) {
    super(ref.key);
  }

  static unmanaged(ref: FeatureRef): GateState {
    return new GateState(ref, false, Gate.NONE, 'none', null, []);
  }

  static create(params: {
    ref: FeatureRef;
    currentGate: Gate;
    profile: string;
    createdAt: Date | null;
    history: AuditEntry[];
  }): GateState {
    return new GateState(params.ref, true, params.currentGate, params.profile, params.createdAt, params.history);
  }

  /** The gate being worked towards. Null once G5 has passed, or when unmanaged. */
  get nextGate(): Gate | null {
    return this.managed ? this.currentGate.next : null;
  }

  /** `aidlc.py` locks every construction command until G3 has passed. */
  get isConstructionUnlocked(): boolean {
    return this.managed && this.currentGate.hasPassed(Gate.create('G3'));
  }

  get isClosed(): boolean {
    return this.managed && this.currentGate.value === 'G5';
  }

  get lastActivityAt(): Date | null {
    const stamps = this.history.map((h) => h.at).filter((d): d is Date => d !== null);
    return stamps.length > 0 ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : this.createdAt;
  }

  get approvals(): AuditEntry[] {
    return this.history.filter((h) => h.isGateApproval);
  }

  get reviewBypasses(): AuditEntry[] {
    return this.history.filter((h) => h.isReviewBypass);
  }

  /** Distinct humans and agents who have acted on this feature. */
  get actors(): string[] {
    return [...new Set(this.history.map((h) => h.by).filter(Boolean))].sort();
  }
}
