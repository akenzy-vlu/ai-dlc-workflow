import { accent, semantic, token } from '@app/theme';
import type { StatTileProps, StatTone } from './stat-tile.props';
import { StatTileView } from './stat-tile.view';

const TONE_COLORS: Record<StatTone, string> = {
  neutral: token.textPrimary,
  good: semantic.success,
  warn: semantic.warning,
  bad: accent.text,
};

export function StatTile({ tone = 'neutral', ...rest }: StatTileProps) {
  return <StatTileView {...rest} color={TONE_COLORS[tone]} />;
}
