import type { ReactNode } from 'react';

/**
 * `bad` is amber rather than red on this console: a "bad" number here is almost always a
 * count of things waiting on a person — blocking assumptions, tickets in review — and
 * that is exactly what amber means. Red stays for things that are actually broken.
 */
export type StatTone = 'neutral' | 'good' | 'warn' | 'bad';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  suffix?: string;
  tone?: StatTone;
  /** Why this number is worth a tile. Every tile answers a question someone asks aloud. */
  hint?: string;
  onClick?: () => void;
}

export interface StatTileViewProps extends Omit<StatTileProps, 'tone'> {
  color: string;
}
