import { amber, graphite } from '@app/theme';
import type { KilnLockupProps, KilnMarkProps } from './kiln-mark.props';
import { KilnMarkView } from './kiln-mark.view';

/**
 * Drawn on the kit's 52×48 grid and scaled uniformly. Below 20px use `/favicon.svg`,
 * which has thicker bars drawn for the size rather than a shrunk copy of this.
 */
export function KilnMark({ size = 20, tone = 'colour', title = 'kiln' }: KilnMarkProps) {
  const fills =
    tone === 'colour'
      ? { gate: amber[500], middle: graphite[400], bottom: graphite[600] }
      : tone === 'on-light'
        ? { gate: amber[700], middle: graphite[300], bottom: graphite[200] }
        : { gate: 'currentColor', middle: 'currentColor', bottom: 'currentColor' };

  const opacity =
    tone === 'mono'
      ? { gate: 1, middle: 0.7, bottom: 0.45 }
      : { gate: 1, middle: 1, bottom: 1 };

  return (
    <KilnMarkView
      size={size}
      height={Math.round((size / 52) * 48)}
      title={title}
      fills={fills}
      opacity={opacity}
    />
  );
}

/** Mark plus wordmark. Lowercase, UI face, medium, with the kit's negative tracking. */
export function KilnLockup({ size = 20 }: KilnLockupProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <KilnMark size={size} />
      <span
        style={{
          fontFamily: 'var(--font-ui)',
          fontWeight: 500,
          fontSize: size * 0.82,
          letterSpacing: '-0.032em',
          color: graphite[50],
          lineHeight: 1,
        }}
      >
        kiln
      </span>
    </span>
  );
}
