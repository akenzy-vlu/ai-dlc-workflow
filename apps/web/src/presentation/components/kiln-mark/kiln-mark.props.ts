export interface KilnMarkProps {
  size?: number;
  /** `mono` inherits `currentColor`; the others use the brand fills for that surface. */
  tone?: 'colour' | 'mono' | 'on-light';
  title?: string;
}

export interface KilnMarkViewProps extends Required<Omit<KilnMarkProps, 'tone'>> {
  height: number;
  fills: { gate: string; middle: string; bottom: string };
  opacity: { gate: number; middle: number; bottom: number };
}

export interface KilnLockupProps {
  size?: number;
}
