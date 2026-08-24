import type { KilnMarkViewProps } from './kiln-mark.props';

/**
 * Three bars for the three AI-DLC phases — Inception, Construction, Operations.
 *
 * The lower two are split, because agents run in parallel there; the top bar is solid and
 * amber, because the human validation gate above them is closed. Reversing that order, or
 * colouring a different bar, throws the whole meaning away.
 */
export function KilnMarkView({ size, height, title, fills, opacity }: KilnMarkViewProps) {
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 52 48"
      role="img"
      aria-label={title}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <title>{title}</title>
      <rect x="0" y="0" width="52" height="8" rx="4" fill={fills.gate} opacity={opacity.gate} />
      <rect x="0" y="20" width="22" height="8" rx="4" fill={fills.middle} opacity={opacity.middle} />
      <rect x="30" y="20" width="22" height="8" rx="4" fill={fills.middle} opacity={opacity.middle} />
      <rect x="0" y="40" width="22" height="8" rx="4" fill={fills.bottom} opacity={opacity.bottom} />
      <rect x="30" y="40" width="22" height="8" rx="4" fill={fills.bottom} opacity={opacity.bottom} />
    </svg>
  );
}
