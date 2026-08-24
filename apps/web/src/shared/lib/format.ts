import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export function formatRelative(iso: string | null | undefined): string {
  return iso ? dayjs(iso).fromNow() : '—';
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '—';
}

/**
 * How stale a projection is.
 *
 * A number nobody can date is a number people over-trust, so anything derived from a scan
 * carries one of these next to it.
 */
export function staleness(iso: string | null): 'fresh' | 'aging' | 'stale' {
  if (!iso) return 'stale';
  const days = dayjs().diff(dayjs(iso), 'day');
  if (days <= 7) return 'fresh';
  return days <= 30 ? 'aging' : 'stale';
}

export function percent(ratio: number): number {
  return Math.round((ratio ?? 0) * 100);
}
