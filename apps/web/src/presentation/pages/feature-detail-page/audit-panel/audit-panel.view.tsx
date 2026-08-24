import { Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { MONO_FONT } from '@app/theme';
import type { AuditEntry } from '@domain/entities';
import { formatDateTime } from '@shared/lib/format';
import type { AuditPanelViewProps } from './audit-panel.props';

export function AuditPanelView({ entries }: AuditPanelViewProps) {
  const columns: ColumnsType<AuditEntry> = [
    { title: 'When', dataIndex: 'at', width: 150, render: (value: string | null) => formatDateTime(value) },
    { title: 'Gate', dataIndex: 'gate', width: 70, render: (value: string) => <Tag style={{ marginInlineEnd: 0 }}>{value}</Tag> },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 220,
      render: (action: string) => (
        <Space size={6}>
          <span>{action}</span>
          {action.includes('review bypassed') ? (
            <Tooltip title="Review was skipped. Recorded rather than hidden — that is the point of the flag.">
              <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                bypass
              </Tag>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    { title: 'By', dataIndex: 'by', width: 120 },
    {
      title: 'Ticket',
      dataIndex: 'ticket',
      width: 110,
      render: (value: string | null) =>
        value ? <span style={{ fontFamily: MONO_FONT }}>{value}</span> : '—',
    },
    {
      title: 'Evidence / reason',
      dataIndex: 'evidence',
      ellipsis: true,
      render: (value: string | null, row) => value ?? row.reason ?? '—',
    },
  ];

  return (
    <Table<AuditEntry>
      rowKey={(row) => `${row.at}-${row.action}-${row.ticket ?? ''}`}
      size="small"
      pagination={{ pageSize: 30 }}
      dataSource={entries}
      columns={columns}
    />
  );
}
