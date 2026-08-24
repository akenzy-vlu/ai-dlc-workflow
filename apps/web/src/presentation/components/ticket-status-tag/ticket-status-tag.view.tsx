import { Tag, Tooltip } from 'antd';

import type { TicketStatusTagViewProps } from './ticket-status-tag.props';

export function TicketStatusTagView({
  label,
  tooltip,
  color,
  background,
  borderColor,
}: TicketStatusTagViewProps) {
  return (
    <Tooltip title={tooltip}>
      <Tag style={{ marginInlineEnd: 0, color, background, borderColor }}>{label}</Tag>
    </Tooltip>
  );
}
