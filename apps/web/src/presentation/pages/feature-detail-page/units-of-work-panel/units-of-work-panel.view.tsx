import { CheckSquareOutlined, RobotOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Card, Collapse, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { accent, MONO_FONT, token } from '@app/theme';
import type { Ticket } from '@domain/entities';
import { TERMINAL_RUN_STATUSES } from '@domain/enums';
import { formatHours } from '@domain/value-objects';
import { TicketStatusTag } from '@presentation/components/ticket-status-tag';
import { AgentRunDrawer, LaunchAgentModal } from '@presentation/features/agent-launcher';
import { TicketActions } from '@presentation/features/ticket-actions';
import type { UnitsOfWorkPanelViewProps } from './units-of-work-panel.props';

/**
 * Slices, each with its tickets.
 *
 * Grouped by unit of work rather than shown as one flat ticket list, because the slice is
 * the thing that gets demoed and accepted — a ticket on its own has no acceptance
 * meaning. The demo script and the definition-of-done sit at the top of each slice for
 * the same reason: they are what G4 is judged against.
 */
export function UnitsOfWorkPanelView({
  repositoryId,
  slug,
  unitsOfWork,
  ticketsOf,
  runFor,
  defaultOpenKeys,
  launchFor,
  openRunId,
  onLaunch,
  onOpenRun,
}: UnitsOfWorkPanelViewProps) {
  const columns: ColumnsType<Ticket> = [
    {
      title: 'Ticket',
      dataIndex: 'id',
      width: 120,
      render: (id: string, row) => (
        <Space size={4}>
          <span style={{ fontFamily: MONO_FONT, fontSize: 12, fontWeight: 500 }}>{id}</span>
          {row.onCriticalPath ? (
            <Tooltip title="On the critical path">
              <Tag
                style={{
                  marginInlineEnd: 0,
                  padding: '0 4px',
                  background: 'transparent',
                  borderColor: token.borderStrong,
                  color: token.textSecondary,
                }}
              >
                c
              </Tag>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    { title: 'Title', dataIndex: 'title', ellipsis: true },
    {
      title: 'Layer',
      dataIndex: 'layer',
      width: 110,
      render: (value: string, row) =>
        row.layerDeclared ? (
          <Tag style={{ marginInlineEnd: 0 }}>{value}</Tag>
        ) : (
          <Tooltip title="Not in the repository's declared layer vocabulary — a hard G3 error">
            <Tag color="error" style={{ marginInlineEnd: 0 }}>
              {value}
            </Tag>
          </Tooltip>
        ),
    },
    { title: 'Est', dataIndex: 'estimateLabel', width: 70, align: 'right' },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (_, row) => (
        <Space size={4}>
          <TicketStatusTag status={row.status} />
          {row.unmetDependencies > 0 ? (
            <Tooltip title={`${row.unmetDependencies} dependency(ies) not done: ${row.dependsOn.join(', ')}`}>
              <Tag style={{ marginInlineEnd: 0 }}>blocked×{row.unmetDependencies}</Tag>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Done when',
      dataIndex: 'doneWhen',
      width: 100,
      align: 'right',
      render: (items: Ticket['doneWhen']) => {
        if (items.length === 0) {
          return (
            <Tooltip title="No done-when checklist — G3 refuses a ticket with no definition of done">
              <Tag color="error" style={{ marginInlineEnd: 0 }}>
                none
              </Tag>
            </Tooltip>
          );
        }
        const done = items.filter((item) => item.done).length;
        return (
          <Tooltip title={items.map((item) => `${item.done ? '[x]' : '[ ]'} ${item.text}`).join('\n')}>
            <Tag
              color={done === items.length ? 'success' : undefined}
              icon={<CheckSquareOutlined />}
              style={{ marginInlineEnd: 0 }}
            >
              {done}/{items.length}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Agent',
      key: 'agent',
      width: 110,
      render: (_, row) => {
        const run = runFor(row.id);
        const working = run !== undefined && !TERMINAL_RUN_STATUSES.includes(run.status);
        if (working && run) {
          return (
            <Tag
              style={{
                marginInlineEnd: 0,
                cursor: 'pointer',
                background: token.bgRaised,
                borderColor: token.borderStrong,
                color: token.textSecondary,
              }}
              onClick={() => onOpenRun(run.id)}
            >
              working
            </Tag>
          );
        }
        if (run) {
          return (
            <Button size="small" type="link" style={{ padding: 0, fontSize: 11.5 }} onClick={() => onOpenRun(run.id)}>
              {run.status}
            </Button>
          );
        }
        if (row.status === 'done') return <span style={{ color: token.textMuted }}>—</span>;
        return (
          <Tooltip
            title={
              row.ready
                ? 'Hand this ticket to an agent CLI'
                : 'The controller will refuse to start this — a dependency is not done'
            }
          >
            <Button
              size="small"
              type="text"
              icon={<RobotOutlined />}
              disabled={!row.ready}
              onClick={() => onLaunch(row)}
            />
          </Tooltip>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      render: (_, row) => (
        <TicketActions
          compact
          repositoryId={repositoryId}
          slug={slug}
          ticketId={row.id}
          status={row.status}
          untickedCount={row.doneWhen.filter((item) => !item.done).length}
          lastSubmittedBy={row.lastSubmittedBy}
        />
      ),
    },
  ];

  return (
    <>
      <Collapse
        defaultActiveKey={defaultOpenKeys}
        items={unitsOfWork.map((uow) => {
          const unticked = uow.definitionOfDone.filter((item) => !item.done).length;
          return {
            key: uow.id,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO_FONT, fontWeight: 500, fontSize: 12.5 }}>{uow.id}</span>
                <span style={{ fontSize: 13 }}>{uow.title}</span>
                <Tag color={uow.status === 'done' ? 'success' : undefined} style={{ marginInlineEnd: 0 }}>
                  {uow.status}
                </Tag>
                {uow.risk === 'high' ? (
                  <Tag color="error" style={{ marginInlineEnd: 0 }}>
                    high risk
                  </Tag>
                ) : null}
                {!uow.demoable ? (
                  <Tooltip title="demoable is not true — a UoW that cannot be demoed is a layer, not a slice. G3 refuses it.">
                    <Tag color="error" icon={<WarningOutlined />} style={{ marginInlineEnd: 0 }}>
                      not demoable
                    </Tag>
                  </Tooltip>
                ) : null}
                {!uow.hasDemoScript ? (
                  <Tooltip title="No `## Demo script` section — an undemoable slice cannot be accepted at G4">
                    <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                      no demo script
                    </Tag>
                  </Tooltip>
                ) : null}
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: token.textSecondary }}>{formatHours(uow.effortHours)}</span>
                  <Progress
                    type="circle"
                    size={22}
                    percent={uow.ticketIds.length ? Math.round((uow.doneCount / uow.ticketIds.length) * 100) : 0}
                    showInfo={false}
                  />
                  <span style={{ fontSize: 11, color: token.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                    {uow.doneCount}/{uow.ticketIds.length}
                  </span>
                </span>
              </div>
            ),
            children: (
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                {uow.demoScript ? (
                  <Card size="small" title="Demo script" styles={{ body: { padding: 12 } }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, fontFamily: 'inherit' }}>
                      {uow.demoScript}
                    </pre>
                  </Card>
                ) : null}

                {uow.definitionOfDone.length > 0 ? (
                  <Card
                    size="small"
                    title={
                      <Space>
                        <span>Definition of done</span>
                        {unticked > 0 ? (
                          <Tag
                            style={{
                              marginInlineEnd: 0,
                              color: accent.text,
                              background: token.bgAccentSoft,
                              borderColor: accent.fill,
                            }}
                          >
                            {unticked} unticked — G4 blocked
                          </Tag>
                        ) : (
                          <Tag color="success">complete</Tag>
                        )}
                      </Space>
                    }
                    styles={{ body: { padding: 12 } }}
                  >
                    {uow.definitionOfDone.map((item, index) => (
                      <div key={index} style={{ fontSize: 12, padding: '2px 0' }}>
                        <span style={{ color: item.done ? token.textMuted : accent.fill, marginRight: 6 }}>
                          {item.done ? '[x]' : '[ ]'}
                        </span>
                        <span style={{ color: item.done ? token.textMuted : token.textPrimary }}>{item.text}</span>
                      </div>
                    ))}
                  </Card>
                ) : null}

                {uow.rollback ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    <strong>Rollback:</strong> {uow.rollback}
                  </Typography.Text>
                ) : (
                  <Typography.Text type="warning" style={{ fontSize: 12 }}>
                    No rollback declared
                  </Typography.Text>
                )}

                <Table<Ticket>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={ticketsOf(uow)}
                  columns={columns}
                  scroll={{ x: 900 }}
                />
              </Space>
            ),
          };
        })}
      />

      {launchFor ? (
        <LaunchAgentModal
          open
          onClose={() => onLaunch(null)}
          repositoryId={repositoryId}
          slug={slug}
          ticketId={launchFor.id}
          ticketTitle={launchFor.title}
          onLaunched={(runId) => onOpenRun(runId)}
        />
      ) : null}

      <AgentRunDrawer runId={openRunId} onClose={() => onOpenRun(null)} />
    </>
  );
}
