import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { MONO_FONT, token } from '@app/theme';
import type { Repository } from '@domain/entities';
import { LocalOnlyBadge } from '@presentation/components/repo-tag';
import { PageHeader } from '@presentation/components/page-header';
import { RepositoryRegister } from '@presentation/features/repository-register';
import { formatRelative } from '@shared/lib/format';
import type { RepositoriesPageViewProps } from './repositories-page.props';

export function RepositoriesPageView({
  repositories,
  loading,
  tooling,
  rescanning,
  onRescan,
  onRemove,
}: RepositoriesPageViewProps) {
  const columns: ColumnsType<Repository> = [
    {
      title: 'Repository',
      dataIndex: 'label',
      render: (label: string, row) => (
        <div>
          <Space size={6}>
            <strong>{label}</strong>
            {row.plansLocalOnly ? <LocalOnlyBadge /> : null}
            {!row.configured ? (
              <Tooltip title="No .ai/aidlc.yaml — no layer vocabulary and no ruleset pin, so uow_graph.py falls back to defaults">
                <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                  unconfigured
                </Tag>
              </Tooltip>
            ) : null}
            {row.hasVerifyBlock ? (
              <Tag
                style={{
                  marginInlineEnd: 0,
                  background: token.bgRaised,
                  borderColor: token.border,
                  color: token.textSecondary,
                }}
              >
                verify
              </Tag>
            ) : null}
          </Space>
          <div style={{ fontSize: 11, color: token.textSecondary, fontFamily: MONO_FONT }}>
            {row.absolutePath}
          </div>
        </div>
      ),
    },
    {
      title: 'Profile',
      dataIndex: 'profile',
      width: 130,
      render: (profile: string) =>
        profile === 'none' ? <span style={{ color: token.textMuted }}>none</span> : <Tag>{profile}</Tag>,
    },
    {
      title: 'Layers',
      dataIndex: 'layers',
      width: 300,
      render: (layers: string[]) =>
        layers.length === 0 ? (
          <Tooltip title="No `layers:` declared — every ticket's layer is judged against uow_graph.py's fallback vocabulary">
            <Tag color="warning" style={{ marginInlineEnd: 0 }}>
              not declared
            </Tag>
          </Tooltip>
        ) : (
          <Space size={4} wrap>
            {layers.map((layer) => (
              <Tag key={layer} style={{ marginInlineEnd: 0, fontSize: 11 }}>
                {layer}
              </Tag>
            ))}
          </Space>
        ),
    },
    {
      title: 'Ruleset',
      dataIndex: 'ruleset',
      width: 90,
      align: 'right',
      render: (ruleset: number | null) => {
        if (ruleset === null) return <span style={{ color: token.textMuted }}>—</span>;
        const expected = tooling?.ruleset ?? null;
        const mismatch = expected !== null && expected !== ruleset;
        return (
          <Tooltip
            title={
              mismatch
                ? `The installed uow_graph.py judges by ruleset ${expected}. Plans here were written under ${ruleset}.`
                : undefined
            }
          >
            <Tag color={mismatch ? 'warning' : undefined} style={{ marginInlineEnd: 0 }}>
              {ruleset}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Git',
      dataIndex: 'git',
      width: 200,
      render: (git: Repository['git']) =>
        git ? (
          <Space size={4} wrap>
            <Tag style={{ fontFamily: MONO_FONT, marginInlineEnd: 0 }}>{git.branch}</Tag>
            <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: token.textSecondary }}>{git.sha}</span>
            {git.isWorktree ? (
              <Tooltip title="A linked worktree — it shares a git dir with its siblings">
                <Tag style={{ marginInlineEnd: 0 }}>worktree</Tag>
              </Tooltip>
            ) : null}
            {git.aiDirDirty ? (
              <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                .ai dirty
              </Tag>
            ) : null}
          </Space>
        ) : (
          <span style={{ color: token.textMuted }}>not a git checkout</span>
        ),
    },
    {
      title: 'Scanned',
      dataIndex: 'lastScannedAt',
      width: 110,
      render: (value: string | null) => (
        <span style={{ fontSize: 12, color: token.textSecondary }}>{formatRelative(value)}</span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, row) => (
        <Popconfirm
          title="Untrack this repository?"
          description="It disappears from the console. Nothing in the checkout is touched."
          onConfirm={() => onRemove(row.id)}
        >
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Repositories"
        subtitle="Which checkouts the console reads. This is the only state it owns — everything else is derived from the plan files."
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={rescanning} onClick={onRescan}>
              Rescan
            </Button>
            <RepositoryRegister />
          </Space>
        }
      />

      {tooling && !tooling.available ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="The AI-DLC controller is not runnable"
          description={
            <span style={{ fontSize: 12 }}>
              {tooling.error} — looked for <code>{tooling.corePath}/scripts/uow_graph.py</code> using{' '}
              <code>{tooling.pythonBin}</code>. Reads still work; every gate and ticket action will
              fail until this is fixed.
            </span>
          }
        />
      ) : tooling ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span style={{ fontSize: 12 }}>
              Controller: <code>uow_graph {tooling.uowGraphVersion}</code>, ruleset{' '}
              <strong>{tooling.ruleset}</strong>
              {tooling.verifyAvailable ? ' · ai-dlc-verify installed' : ' · ai-dlc-verify not installed'}
            </span>
          }
        />
      ) : null}

      <Table<Repository>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={repositories}
        columns={columns}
        pagination={false}
        scroll={{ x: 1200 }}
      />

      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 16 }}>
        Adding a repository reads it and nothing more. The console never writes to a checkout except
        through <code>aidlc.py</code> and <code>uow_graph.py</code>, and never edits{' '}
        <code>.aidlc-state.yaml</code> at all — that file is the reason a gate holds.
      </Typography.Paragraph>
    </>
  );
}
