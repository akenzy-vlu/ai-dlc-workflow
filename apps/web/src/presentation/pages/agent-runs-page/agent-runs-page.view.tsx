import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';

import { ROUTES } from '@app/router/routes';
import { MONO_FONT, token } from '@app/theme';
import type { AgentRun } from '@domain/entities';
import type { AgentRunStatus } from '@domain/enums';
import { PageHeader } from '@presentation/components/page-header';
import { AgentRunDrawer } from '@presentation/features/agent-launcher';
import { formatDateTime, formatRelative } from '@shared/lib/format';
import type { AgentRunsPageViewProps } from './agent-runs-page.props';

const STATUS_COLOR: Record<AgentRunStatus, string> = {
  queued: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'warning',
};

export function AgentRunsPageView({
  runs,
  loading,
  fetching,
  repositories,
  repositoryId,
  available,
  unavailable,
  openRunId,
  onRepositoryChange,
  onRefresh,
  onOpenRun,
  onCloseRun,
}: AgentRunsPageViewProps) {
  const columns: ColumnsType<AgentRun> = [
    {
      title: 'Ticket',
      dataIndex: 'ticketId',
      width: 260,
      render: (_, run) => (
        <div>
          <Link
            to={`${ROUTES.feature(run.repositoryId, run.slug)}?ticket=${run.ticketId}`}
            style={{ fontFamily: MONO_FONT, fontSize: 12.5, fontWeight: 500 }}
          >
            {run.ticketId}
          </Link>
          <div style={{ fontSize: 11, color: token.textSecondary }}>
            {run.repositoryLabel} · {run.slug}
          </div>
        </div>
      ),
    },
    {
      title: 'Agent',
      dataIndex: 'agentLabel',
      width: 150,
      render: (label: string) => <Tag style={{ marginInlineEnd: 0 }}>{label}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      filters: (['running', 'succeeded', 'failed', 'cancelled'] as AgentRunStatus[]).map((status) => ({
        text: status,
        value: status,
      })),
      onFilter: (value, run) => run.status === value,
      render: (status: AgentRunStatus, run) => (
        <Space size={4}>
          <Tag color={STATUS_COLOR[status]} style={{ marginInlineEnd: 0 }}>
            {status}
          </Tag>
          {run.exitCode !== null && run.exitCode !== 0 ? (
            <span style={{ fontSize: 11, color: token.textMuted }}>exit {run.exitCode}</span>
          ) : null}
        </Space>
      ),
    },
    { title: 'Launched by', dataIndex: 'launchedBy', width: 140 },
    {
      title: 'Started',
      dataIndex: 'startedAt',
      width: 150,
      sorter: (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
      defaultSortOrder: 'descend',
      render: (value: string | null) => (
        <Tooltip title={formatDateTime(value)}>
          <span style={{ fontSize: 12, color: token.textSecondary }}>{formatRelative(value)}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Output',
      dataIndex: 'lineCount',
      width: 100,
      align: 'right',
      render: (count: number) => (
        <span style={{ fontSize: 12, color: token.textSecondary }}>{count} lines</span>
      ),
    },
    {
      title: '',
      key: 'open',
      width: 90,
      render: (_, run) => (
        <Button size="small" onClick={() => onOpenRun(run.id)}>
          Transcript
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Agent runs"
        subtitle="Every agent this console has handed a ticket to, and what it did. The ticket's own state change is in the repository's audit trail; this is the transcript behind it."
        extra={
          <Space>
            <Select
              allowClear
              placeholder="All repositories"
              style={{ width: 200 }}
              value={repositoryId}
              onChange={onRepositoryChange}
              options={repositories.map((repository) => ({ value: repository.id, label: repository.label }))}
            />
            <Button icon={<ReloadOutlined />} loading={fetching} onClick={onRefresh}>
              Refresh
            </Button>
          </Space>
        }
      />

      <Alert
        type={available.length > 0 ? 'info' : 'warning'}
        showIcon
        style={{ marginBottom: 16 }}
        message={
          available.length > 0
            ? `Available on this machine: ${available.map((agent) => agent.label).join(', ')}`
            : 'No agent CLI found on this machine'
        }
        description={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            The console drives agent CLIs; it does not ship them.
            {unavailable.length > 0 ? ` Not found: ${unavailable.map((a) => a.binary).join(', ')}.` : ''}{' '}
            Add your own in <code>~/.aidlc-console/agents.json</code> with an <code>id</code>,{' '}
            <code>binary</code> and the flags that make it run once and exit.
          </Typography.Text>
        }
      />

      <Table<AgentRun>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={runs}
        columns={columns}
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 25, showTotal: (total) => `${total} runs` }}
        locale={{
          emptyText:
            'No agent has been handed a ticket yet. Open a feature board and use the robot button on a pickable ticket.',
        }}
      />

      <AgentRunDrawer runId={openRunId} onClose={onCloseRun} />
    </>
  );
}
