import { Empty, Typography } from 'antd';

import type { EmptyHintViewProps } from './empty-hint.props';

export function EmptyHintView({ title, hint, action }: EmptyHintViewProps) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <div>
          <div style={{ fontWeight: 500 }}>{title}</div>
          {hint ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {hint}
            </Typography.Text>
          ) : null}
        </div>
      }
    >
      {action}
    </Empty>
  );
}
