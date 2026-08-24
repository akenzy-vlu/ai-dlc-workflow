import { ValueObject } from './value-object';

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskValue = (typeof RISK_LEVELS)[number] | 'unknown';

export class Risk extends ValueObject<string> {
  static readonly UNKNOWN = new Risk('unknown');
  private constructor(value: string) {
    super(value);
  }
  static create(value: string | undefined): Risk {
    const v = (value ?? '').trim().toLowerCase();
    return (RISK_LEVELS as readonly string[]).includes(v) ? new Risk(v) : Risk.UNKNOWN;
  }
  get value(): RiskValue {
    return this.props as RiskValue;
  }
  get isHigh(): boolean {
    return this.props === 'high';
  }
  toString(): string {
    return this.props;
  }
}

export const TICKET_TYPES = ['feature', 'test', 'refactor', 'chore', 'spike'] as const;
export type TicketTypeValue = (typeof TICKET_TYPES)[number] | 'unknown';

export class TicketType extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }
  static create(value: string | undefined): TicketType {
    const v = (value ?? '').trim().toLowerCase();
    return new TicketType((TICKET_TYPES as readonly string[]).includes(v) ? v : 'unknown');
  }
  get value(): TicketTypeValue {
    return this.props as TicketTypeValue;
  }
  get isRecognised(): boolean {
    return this.props !== 'unknown';
  }
  toString(): string {
    return this.props;
  }
}

/**
 * A layer name is only meaningful against the `layers:` vocabulary the target repo
 * declares in `.ai/aidlc.yaml` — this repo uses `[config, data, ui, page, test]`, that
 * one uses `[domain, application, infra, api, test]`. So the value object holds the
 * name and the *verdict*, and the verdict is supplied by whoever knows the vocabulary.
 */
export class Layer extends ValueObject<{ name: string; declared: boolean }> {
  private constructor(name: string, declared: boolean) {
    super({ name, declared });
  }
  static create(name: string | undefined, vocabulary: readonly string[]): Layer {
    const v = (name ?? '').trim().toLowerCase();
    return new Layer(v || 'unknown', vocabulary.includes(v));
  }
  get name(): string {
    return this.props.name;
  }
  /** False means the ticket names a layer the repo has not declared — a G3 error. */
  get isDeclared(): boolean {
    return this.props.declared;
  }
  toString(): string {
    return this.props.name;
  }
}
