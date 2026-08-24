import { Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';

import { ROUTES } from '@app/router/routes';
import { MONO_FONT, token } from '@app/theme';
import type { AuditRow } from '@domain/entities';
import { GateTag } from '@presentation/components/gate-tag';
import { PageHeader } from '@presentation/components/page-header';
import { formatDateTime } from '@shared/lib/format';
import type { AuditPageViewProps } from './audit-page.props';

/**
 * Who approved what, portfolio-wide.
 *
 * Not an activity feed. Every row is an action a named person took responsibility for,
 * and on repositories that do not commit `.ai/`, this trail is the only place it is
 * recorded at all.
 */
export function AuditPageView({
  rows,
  loading,
  repositories,
  repositoryId,
  onRepositoryChange,
}: AuditPageViewProps) {
  const columns: ColumnsType<AuditRow> = [
    { title: 'When', dataIndex: 'at', width: 150, render: (value: string | null) => formatDateTime(value) },
    {
      title: 'Feature',
      dataIndex: 'featureSlug',
      width: 300,
      render: (slug: string, row) => (
        <div>
          <Link
            to={ROUTES.feature(row.repositoryId, slug)}
            style={{ fontFamily: MONO_FONT, fontSize: 12 }}
          >
            {slug}
          </Link>
          <div style={{ fontSize: 11, color: token.textSecondary }}>{row.repositoryLabel}</div>
        </div>
      ),
    },
    { title: 'Gate', dataIndex: 'gate', width: 90, render: (gate: AuditRow['gate']) => <GateTag gate={gate} /> },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 220,
      render: (action: string, row) => (
        <Space size={6}>
          <span>{action}</span>
          {row.reviewBypass ? (
            <Tooltip title="Review was skipped with --no-review. The controller records the bypass rather than hiding it.">
              <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                bypass
              </Tag>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    { title: 'By', dataIndex: 'by', width: 130, render: (by: string) => <Tag style={{ marginInlineEnd: 0 }}>{by}</Tag> },
    {
      title: 'Ticket',
      dataIndex: 'ticket',
      width: 110,
      render: (value: string | null) =>
        value ? <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{value}</span> : '—',
    },
    {
      title: 'Evidence / reason',
      dataIndex: 'evidence',
      ellipsis: true,
      render: (value: string | null, row) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {value ?? row.reason ?? '—'}
        </Typography.Text>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Approval trail"
        subtitle="Append-only, across every repository. On repos that do not commit .ai/, this is the only durable record of who approved what."
        extra={
          <Select
            allowClear
            placeholder="All repositories"
            style={{ width: 220 }}
            value={repositoryId}
            onChange={onRepositoryChange}
            options={repositories.map((repository) => ({ value: repository.id, label: repository.label }))}
          />
        }
      />
      <Table<AuditRow>
        rowKey={(row) => `${row.repositoryId}/${row.featureSlug}/${row.at}/${row.action}/${row.ticket ?? ''}`}
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 40, showTotal: (total) => `${total} recorded actions` }}
      />
    </>
  );
}
