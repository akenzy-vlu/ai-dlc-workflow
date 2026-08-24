import { Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { accent, MONO_FONT, token } from '@app/theme';
import type { Assumption } from '@domain/entities';
import type { AssumptionsPanelViewProps } from './assumptions-panel.props';

export function AssumptionsPanelView({ assumptions }: AssumptionsPanelViewProps) {
  const columns: ColumnsType<Assumption> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
      render: (value: string) => <span style={{ fontFamily: MONO_FONT }}>{value}</span>,
    },
    { title: 'Assumption', dataIndex: 'text', ellipsis: true },
    {
      title: 'Blocking',
      dataIndex: 'blocking',
      width: 100,
      render: (blocking: boolean, row) =>
        blocking ? (
          <Tag
            style={{
              marginInlineEnd: 0,
              color: row.isOpen ? accent.text : token.textSecondary,
              background: row.isOpen ? token.bgAccentSoft : token.bgRaised,
              borderColor: row.isOpen ? accent.fill : token.border,
            }}
          >
            {row.isOpen ? 'blocking' : 'was blocking'}
          </Tag>
        ) : (
          <span style={{ color: token.textMuted }}>—</span>
        ),
    },
    { title: 'Confidence', dataIndex: 'confidence', width: 100 },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (status: string, row) => (
        <Space size={4}>
          <Tag color={row.isOpen ? 'warning' : 'success'} style={{ marginInlineEnd: 0 }}>
            {status}
          </Tag>
          {row.isUnjustified ? (
            <Tooltip title="Settled with no resolution note — who confirmed it, and when?">
              <Tag style={{ marginInlineEnd: 0 }}>?</Tag>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    { title: 'Blast radius if wrong', dataIndex: 'blastRadius', ellipsis: true, width: 260 },
    { title: 'Resolution', dataIndex: 'resolution', ellipsis: true, width: 260 },
  ];

  return (
    <Table<Assumption>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={assumptions}
      columns={columns}
      scroll={{ x: 1000 }}
    />
  );
}
