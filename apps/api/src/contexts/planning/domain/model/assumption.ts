import { Entity, ValueObject } from '../../../../shared/kernel';
import { normaliseCell } from '../../../../shared/infrastructure/text/markdown.reader';

/**
 * Assumption lifecycle as it actually appears in the files, not as a schema wishes it did.
 *
 * `aidlc.py` only distinguishes `pending` from everything else, and treats
 * `confirmed`/`rejected` as needing a resolution note. Real registers also carry
 * `resolved`, `superseded`, `accepted` and `open`, sometimes wrapped in `**bold**`.
 * Anything unrecognised is `unknown` — visible as such rather than silently counted as
 * settled, because miscounting an open assumption as closed is the expensive direction.
 */
export const ASSUMPTION_STATUSES = [
  'pending', 'open', 'confirmed', 'accepted', 'resolved', 'rejected', 'superseded', 'unknown',
] as const;
export type AssumptionStatusValue = (typeof ASSUMPTION_STATUSES)[number];

const SETTLED: readonly AssumptionStatusValue[] = ['confirmed', 'accepted', 'resolved', 'rejected', 'superseded'];

export class AssumptionStatus extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static parse(raw: string | undefined): AssumptionStatus {
    const v = normaliseCell(raw ?? '');
    const match = (ASSUMPTION_STATUSES as readonly string[]).find((s) => v === s || v.startsWith(`${s} `));
    return new AssumptionStatus(match ?? 'unknown');
  }

  get value(): AssumptionStatusValue {
    return this.props as AssumptionStatusValue;
  }
  /** Nobody has answered it yet. With `blocking`, this is what holds G1 shut. */
  get isOpen(): boolean {
    return this.props === 'pending' || this.props === 'open';
  }
  get isSettled(): boolean {
    return SETTLED.includes(this.props as AssumptionStatusValue);
  }
  toString(): string {
    return this.props;
  }
}

export interface AssumptionProps {
  id: string;
  text: string;
  confidence: string;
  blocking: boolean;
  blastRadius: string;
  status: AssumptionStatus;
  resolution: string;
}

/**
 * One row of `01-assumptions.md`.
 *
 * The register is where a plan admits what it does not know. A blocking assumption still
 * pending is the single most actionable item in this whole console: it is work that
 * cannot start, and the only thing that unblocks it is a human answering a question.
 */
export class Assumption extends Entity<string> {
  private constructor(private readonly props: AssumptionProps) {
    super(props.id);
  }

  static create(props: AssumptionProps): Assumption {
    return new Assumption(props);
  }

  get text(): string {
    return this.props.text;
  }
  get confidence(): string {
    return this.props.confidence;
  }
  get isBlocking(): boolean {
    return this.props.blocking;
  }
  get blastRadius(): string {
    return this.props.blastRadius;
  }
  get status(): AssumptionStatus {
    return this.props.status;
  }
  get resolution(): string {
    return this.props.resolution;
  }

  /** The G1 blocker: blocking *and* nobody has answered. */
  get blocksElaboration(): boolean {
    return this.props.blocking && this.props.status.isOpen;
  }

  /**
   * Settled but with no note saying who settled it or why. `check_g1` refuses this:
   * "resolved with no resolution note — who confirmed it, and when?"
   */
  get isUnjustified(): boolean {
    return this.props.status.isSettled && this.props.resolution.trim().length === 0;
  }
}
