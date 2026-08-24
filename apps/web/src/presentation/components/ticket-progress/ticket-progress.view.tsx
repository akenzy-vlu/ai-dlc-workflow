import { Badge } from 'antd';

import { token } from '@app/theme';
import type { TicketProgressViewProps } from './ticket-progress.props';

export function TicketProgressView({ done, total, color, empty }: TicketProgressViewProps) {
  if (empty) return <span style={{ color: token.textMuted }}>—</span>;

  return (
    <Badge
      color={color}
      text={
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {done}/{total}
        </span>
      }
    />
  );
}
