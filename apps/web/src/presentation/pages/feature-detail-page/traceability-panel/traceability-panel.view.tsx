import { Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { MONO_FONT } from '@app/theme';
import type { AcceptanceCriterion } from '@domain/entities';
import type { TraceabilityPanelViewProps } from './traceability-panel.props';

export function TraceabilityPanelView({ criteria }: TraceabilityPanelViewProps) {
  const columns: ColumnsType<AcceptanceCriterion> = [
    {
      title: 'AC',
      dataIndex: 'id',
      width: 80,
      render: (value: string) => <span style={{ fontFamily: MONO_FONT }}>{value}</span>,
    },
    { title: 'Story', dataIndex: 'story', width: 220, ellipsis: true, render: (value: string | null) => value ?? '—' },
    { title: 'Criterion', dataIndex: 'title', ellipsis: true },
    {
      title: 'Covered by',
      dataIndex: 'coveredBy',
      width: 260,
      render: (tickets: string[]) =>
        tickets.length === 0 ? (
          <Tooltip title="No ticket claims this criterion — a hard G3 error">
            <Tag color="error" style={{ marginInlineEnd: 0 }}>
              UNCOVERED
            </Tag>
          </Tooltip>
        ) : (
          <Space size={4} wrap>
            {tickets.map((id) => (
              <Tag key={id} style={{ fontFamily: MONO_FONT, marginInlineEnd: 0 }}>
                {id}
              </Tag>
            ))}
          </Space>
        ),
    },
  ];

  return (
    <Table<AcceptanceCriterion>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={criteria}
      columns={columns}
    />
  );
}
