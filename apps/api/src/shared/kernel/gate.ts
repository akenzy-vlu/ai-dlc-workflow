import { InvalidValueError } from './domain-error';
import { ValueObject } from './value-object';

export const GATE_ORDER = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'] as const;
export type GateCode = (typeof GATE_ORDER)[number];

/** Mirrors GATE_TITLES in ai-dlc-core/scripts/aidlc.py. Kept in sync deliberately. */
export const GATE_TITLES: Record<GateCode, string> = {
  G0: 'Discovery and intent',
  G1: 'Elaboration — assumptions and requirements',
  G2: 'Logical design',
  G3: 'Decomposition — units of work and ticket graph',
  G4: 'Construction complete',
  G5: 'Close',
};

/**
 * A gate is an ordinal position, not a label — the whole point of AI-DLC is that you
 * cannot jump one. `NONE` is the state of a feature that has been initialised but has
 * not passed G0 yet; a feature directory with no state file at all is *unmanaged*, which
 * is a different thing and is modelled in governance, not here.
 */
export class Gate extends ValueObject<string> {
  static readonly NONE = new Gate('none');

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Gate {
    const v = (value ?? '').trim().toUpperCase();
    if (!v || v === 'NONE') return Gate.NONE;
    if (!(GATE_ORDER as readonly string[]).includes(v)) {
      throw new InvalidValueError(`unknown gate "${value}" — expected one of ${GATE_ORDER.join(', ')}`);
    }
    return new Gate(v);
  }

  static tryCreate(value: string): Gate {
    try {
      return Gate.create(value);
    } catch {
      return Gate.NONE;
    }
  }

  get value(): string {
    return this.props;
  }

  get isNone(): boolean {
    return this.props === 'none';
  }

  get code(): GateCode | null {
    return this.isNone ? null : (this.props as GateCode);
  }

  get title(): string {
    return this.isNone ? 'Not started' : GATE_TITLES[this.props as GateCode];
  }

  /** -1 for `none`, so `index + 1` is always the next gate's position. */
  get index(): number {
    return this.isNone ? -1 : GATE_ORDER.indexOf(this.props as GateCode);
  }

  /** The gate this feature is working towards. `null` once G5 has passed. */
  get next(): Gate | null {
    const n = this.index + 1;
    return n < GATE_ORDER.length ? Gate.create(GATE_ORDER[n]) : null;
  }

  hasPassed(gate: Gate): boolean {
    return this.index >= gate.index;
  }

  toString(): string {
    return this.props;
  }
}
