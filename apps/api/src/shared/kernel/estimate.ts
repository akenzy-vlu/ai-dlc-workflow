import { ValueObject } from './value-object';

const WORKING_HOURS_PER_DAY = 8;

/**
 * A ticket estimate, normalised to hours. Mirrors `parse_estimate` in uow_graph.py:
 * `30m`, `2h`, `1.5h`, `1d` — a bare number is hours.
 *
 * Unparseable input yields a zero estimate rather than throwing, because the console
 * must be able to *display* a plan the validator would reject; refusing to render it
 * would hide exactly the plans that need attention.
 */
export class Estimate extends ValueObject<{ hours: number; raw: string }> {
  static readonly ZERO = new Estimate(0, '');

  private constructor(hours: number, raw: string) {
    super({ hours, raw });
  }

  static parse(raw: string | undefined): Estimate {
    const text = (raw ?? '').trim();
    const m = /^(\d+(?:\.\d+)?)\s*([hmd]?)$/i.exec(text);
    if (!m) return new Estimate(0, text);
    const amount = Number(m[1]);
    const unit = (m[2] || 'h').toLowerCase();
    const hours = unit === 'm' ? amount / 60 : unit === 'd' ? amount * WORKING_HOURS_PER_DAY : amount;
    return new Estimate(hours, text);
  }

  static fromHours(hours: number): Estimate {
    return new Estimate(hours, Estimate.format(hours));
  }

  static format(hours: number): string {
    if (hours <= 0) return '0h';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    const days = hours / WORKING_HOURS_PER_DAY;
    if (days >= 1) return `${Number(days.toFixed(1))}d`;
    return `${Number(hours.toFixed(2))}h`;
  }

  get hours(): number {
    return this.props.hours;
  }
  get days(): number {
    return this.props.hours / WORKING_HOURS_PER_DAY;
  }
  get raw(): string {
    return this.props.raw;
  }
  get isParseable(): boolean {
    return this.props.hours > 0 || this.props.raw === '';
  }
  plus(other: Estimate): Estimate {
    return Estimate.fromHours(this.hours + other.hours);
  }
  toString(): string {
    return Estimate.format(this.props.hours);
  }
}
