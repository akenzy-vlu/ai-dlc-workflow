import { Card, Tooltip, Typography } from 'antd';

import type { StatTileViewProps } from './stat-tile.props';

export function StatTileView({ label, value, suffix, hint, color, onClick }: StatTileViewProps) {
  const body = (
    <Card
      size="small"
      hoverable={Boolean(onClick)}
      onClick={onClick}
      styles={{ body: { padding: '10px 14px' } }}
      style={{ minWidth: 132 }}
    >
      <Typography.Text
        type="secondary"
        style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}
      >
        {label}
      </Typography.Text>
      <div
        style={{
          fontSize: 22,
          fontWeight: 500,
          color,
          lineHeight: 1.25,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {suffix ? <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 3 }}>{suffix}</span> : null}
      </div>
    </Card>
  );

  return hint ? <Tooltip title={hint}>{body}</Tooltip> : body;
}
