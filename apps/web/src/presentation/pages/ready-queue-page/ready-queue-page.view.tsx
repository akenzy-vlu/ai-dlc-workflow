import { NodeIndexOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, InputNumber, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';

import { ROUTES } from '@app/router/routes';
import { MONO_FONT, token } from '@app/theme';
import type { ReadyTicket } from '@domain/entities';
import { formatHours } from '@domain/value-objects';
import { PageHeader } from '@presentation/components/page-header';
import type { ReadyQueuePageViewProps } from './ready-queue-page.props';

/**
 * Every ticket that could be started right now, anywhere.
 *
 * Sorted by how much it unblocks rather than by size. A two-hour ticket that frees five
 * others is worth more than a two-hour ticket that frees none, and an estimate-sorted
 * list hides that — which is how a team does all the easy leaves while the chain that
 * decides the deadline sits untouched.
 */
export function ReadyQueuePageView({
  rows,
  loading,
  fetching,
  repositories,
  layers,
  types,
  filters,
  totalHours,
  onFilterChange,
  onRefresh,
}: ReadyQueuePageViewProps) {
  const columns: ColumnsType<ReadyTicket> = [
    {
      title: 'Ticket',
      dataIndex: 'ticketId',
      width: 260,
      render: (_, row) => (
        <div>
          <Space size={6}>
            <Link
              to={`${ROUTES.feature(row.repositoryId, row.featureSlug)}?ticket=${row.ticketId}`}
              style={{ fontFamily: MONO_FONT, fontWeight: 500, fontSize: 12.5 }}
            >
              {row.ticketId}
            </Link>
            {row.onCriticalPath ? (
              <Tooltip title="On the feature's critical path — every hour here is an hour on the finish date">
                <Tag
                  style={{
                    marginInlineEnd: 0,
                    background: 'transparent',
                    borderColor: token.borderStrong,
                    color: token.textSecondary,
                  }}
                >
                  critical
                </Tag>
              </Tooltip>
            ) : null}
          </Space>
          <div style={{ fontSize: 11, color: token.textSecondary }}>
            {row.repositoryLabel} · {row.featureSlug}
          </div>
        </div>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      ellipsis: true,
      render: (title: string, row) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5 }}>{title}</div>
          {row.uowTitle ? (
            <div style={{ fontSize: 11, color: token.textSecondary }}>
              {row.uowId} — {row.uowTitle}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Unblocks',
      dataIndex: 'unblocks',
      width: 100,
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.unblocks - b.unblocks,
      render: (value: number) =>
        value > 0 ? (
          <Tooltip title={`${value} ticket(s) downstream become reachable once this lands`}>
            <Tag
              icon={<NodeIndexOutlined />}
              style={{
                marginInlineEnd: 0,
                background: token.bgRaised,
                borderColor: token.border,
                color: token.textSecondary,
              }}
            >
              {value}
            </Tag>
          </Tooltip>
        ) : (
          <span style={{ color: token.textMuted }}>—</span>
        ),
    },
    {
      title: 'Layer',
      dataIndex: 'layer',
      width: 120,
      render: (value: string, row) =>
        row.layerDeclared ? (
          <Tag style={{ marginInlineEnd: 0 }}>{value}</Tag>
        ) : (
          <Tooltip title="Not in the repository's declared vocabulary — uow_graph.py rejects it at G3">
            <Tag color="error" style={{ marginInlineEnd: 0 }}>
              {value}
            </Tag>
          </Tooltip>
        ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 90,
      render: (value: string) => <Tag style={{ marginInlineEnd: 0 }}>{value}</Tag>,
    },
    {
      title: 'Estimate',
      dataIndex: 'estimateHours',
      width: 90,
      align: 'right',
      sorter: (a, b) => a.estimateHours - b.estimateHours,
      render: (_, row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.estimateLabel || '—'}</span>,
    },
    {
      title: 'Touches',
      dataIndex: 'touches',
      width: 260,
      render: (paths: string[]) =>
        paths.length === 0 ? (
          <Tooltip title="No `touches` paths — hard to review scope, and invisible to the write-conflict check">
            <Tag color="warning" style={{ marginInlineEnd: 0 }}>
              none declared
            </Tag>
          </Tooltip>
        ) : (
          <Tooltip title={paths.join('\n')}>
            <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: token.textSecondary }}>
              {paths[0].split('/').slice(-1)[0]}
              {paths.length > 1 ? ` +${paths.length - 1}` : ''}
            </span>
          </Tooltip>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Pickable right now"
        subtitle="Dependencies satisfied, construction unlocked. Sorted by what each one frees, not by how small it is."
        extra={
          <Space wrap>
            <Select
              allowClear
              placeholder="All repositories"
              style={{ width: 180 }}
              value={filters.repositoryId}
              onChange={(repositoryId) => onFilterChange({ repositoryId })}
              options={repositories.map((repository) => ({ value: repository.id, label: repository.label }))}
            />
            <Select
              allowClear
              placeholder="Layer"
              style={{ width: 130 }}
              value={filters.layer}
              onChange={(layer) => onFilterChange({ layer })}
              options={layers.map((layer) => ({ value: layer, label: layer }))}
            />
            <Select
              allowClear
              placeholder="Type"
              style={{ width: 120 }}
              value={filters.type}
              onChange={(type) => onFilterChange({ type })}
              options={types.map((type) => ({ value: type, label: type }))}
            />
            <InputNumber
              placeholder="Max hours"
              style={{ width: 110 }}
              min={0.5}
              step={0.5}
              value={filters.maxHours}
              onChange={(maxHours) => onFilterChange({ maxHours })}
            />
            <Button icon={<ReloadOutlined />} loading={fetching} onClick={onRefresh}>
              Refresh
            </Button>
          </Space>
        }
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          <span>
            {rows.length} ticket(s) · {formatHours(totalHours)} of work
          </span>
        }
        description={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Features below G3 contribute nothing to this list, however satisfied their dependencies
            look. Construction is locked until the plan is agreed — that is the gate doing its job,
            not a filter you want to remove.
          </Typography.Text>
        }
      />

      <Table<ReadyTicket>
        rowKey={(row) => `${row.repositoryId}/${row.featureSlug}/${row.ticketId}`}
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 30, showTotal: (total) => `${total} tickets` }}
      />
    </>
  );
}
