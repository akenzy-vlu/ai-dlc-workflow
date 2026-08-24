const WORKING_HOURS_PER_DAY = 8;

/**
 * An amount of work, normalised to hours.
 *
 * The API sends both the raw label a ticket wrote (`3h`, `1.5d`) and the normalised
 * hours, and both are kept: the label is what the plan file says and is what a reader
 * should see on a card, while the hours are the only safe thing to add up. Summing
 * labels is how a column header ends up claiming ninety minutes for `1.5d` of work.
 */
export interface Estimate {
  hours: number;
  label: string;
}

export const estimate = (hours: number, label?: string): Estimate => ({
  hours,
  label: label ?? formatHours(hours),
});

export function formatHours(hours: number): string {
  if (!hours || hours <= 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < WORKING_HOURS_PER_DAY) return `${Number(hours.toFixed(1))}h`;
  return `${Number((hours / WORKING_HOURS_PER_DAY).toFixed(1))}d`;
}

export const sumHours = <T>(items: readonly T[], read: (item: T) => number): number =>
  items.reduce((total, item) => total + read(item), 0);
