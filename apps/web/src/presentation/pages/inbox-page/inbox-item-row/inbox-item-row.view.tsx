import { ArrowRightOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';

import { MONO_FONT, token } from '@app/theme';
import type { InboxItemRowViewProps } from './inbox-item-row.props';

export function InboxItemRowView({ item, last, featurePath }: InboxItemRowViewProps) {
  return (
    <div
      style={{
        padding: '10px 16px',
        borderBottom: last ? 'none' : `1px solid ${token.border}`,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space size={6} wrap style={{ marginBottom: 2 }}>
          <Tag style={{ marginInlineEnd: 0 }}>{item.repositoryLabel}</Tag>
          {featurePath ? (
            <Link to={featurePath} style={{ fontFamily: MONO_FONT, fontSize: 12 }}>
              {item.featureSlug}
            </Link>
          ) : null}
        </Space>
        <div style={{ fontWeight: 500 }}>{item.title}</div>
        {item.detail ? (
          <Typography.Paragraph
            type="secondary"
            style={{ fontSize: 12, margin: '2px 0 0' }}
            ellipsis={{ rows: 2, expandable: true, symbol: 'more' }}
          >
            {item.detail}
          </Typography.Paragraph>
        ) : null}
        {item.suggestedAction ? (
          <div style={{ fontSize: 11, color: token.textAccent, marginTop: 4, fontFamily: MONO_FONT }}>
            <ArrowRightOutlined /> {item.suggestedAction}
          </div>
        ) : null}
      </div>
      {featurePath ? (
        <Link to={featurePath}>
          <Button size="small">Open</Button>
        </Link>
      ) : null}
    </div>
  );
}
