import { CloseCircleOutlined } from '@ant-design/icons';
import { Button, Descriptions, Drawer, Space, Tag, Typography } from 'antd';

import { MONO_FONT, TERMINAL, token } from '@app/theme';
import { TERMINAL_RUN_STATUSES } from '@domain/enums';
import { formatDateTime } from '@shared/lib/format';
import type { AgentRunDrawerViewProps } from './agent-run-drawer.props';

const STATUS_COLOR: Record<string, string> = {
  queued: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'warning',
};

export function AgentRunDrawerView({
  open,
  run,
  lines,
  cancelling,
  follow,
  bodyRef,
  onScroll,
  onFollowAgain,
  onCancel,
  onClose,
}: AgentRunDrawerViewProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column' },
        wrapper: { width: 860 },
      }}
      title={
        run ? (
          <Space size={8} wrap>
            <span style={{ fontFamily: MONO_FONT, fontWeight: 500 }}>{run.ticketId}</span>
            <Tag color={STATUS_COLOR[run.status]} style={{ marginInlineEnd: 0 }}>
              {run.status}
            </Tag>
            <Tag style={{ marginInlineEnd: 0 }}>{run.agentLabel}</Tag>
          </Space>
        ) : (
          'Agent run'
        )
      }
      extra={
        run && !TERMINAL_RUN_STATUSES.includes(run.status) ? (
          <Button danger size="small" icon={<CloseCircleOutlined />} loading={cancelling} onClick={onCancel}>
            Stop
          </Button>
        ) : null
      }
    >
      {run ? (
        <>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${token.border}` }}>
            <Descriptions
              size="small"
              column={2}
              colon={false}
              labelStyle={{ color: token.textSecondary, fontSize: 11.5 }}
            >
              <Descriptions.Item label="Repository">
                {run.repositoryLabel} · {run.slug}
              </Descriptions.Item>
              <Descriptions.Item label="Launched by">{run.launchedBy}</Descriptions.Item>
              <Descriptions.Item label="Recorded as">{run.actingAs}</Descriptions.Item>
              <Descriptions.Item label="Started">{formatDateTime(run.startedAt)}</Descriptions.Item>
              <Descriptions.Item label="Finished">
                {run.finishedAt ? `${formatDateTime(run.finishedAt)} (exit ${run.exitCode})` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Working directory">
                <span style={{ fontFamily: MONO_FONT, fontSize: 11 }}>{run.cwd}</span>
              </Descriptions.Item>
            </Descriptions>
            {run.suggestsSubmit ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Finished cleanly. It is not accepted — read the diff, then submit and accept the ticket
                yourself.
              </Typography.Text>
            ) : null}
          </div>

          <div
            ref={bodyRef}
            onScroll={onScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              background: TERMINAL.bg,
              padding: '12px 16px',
              fontFamily: MONO_FONT,
              fontSize: 11.5,
              lineHeight: 1.55,
            }}
          >
            {lines.length === 0 ? (
              <span style={{ color: TERMINAL.dim }}>waiting for output…</span>
            ) : (
              lines.map((line, index) => (
                <div
                  key={`${line.at}-${index}`}
                  style={{
                    color:
                      line.stream === 'stderr'
                        ? TERMINAL.stderr
                        : line.stream === 'console'
                          ? TERMINAL.notice
                          : TERMINAL.text,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {line.text || ' '}
                </div>
              ))
            )}
          </div>

          {!follow ? (
            <button
              type="button"
              onClick={onFollowAgain}
              style={{
                position: 'absolute',
                right: 28,
                bottom: 24,
                padding: '5px 12px',
                borderRadius: 999,
                border: 'none',
                background: 'rgba(247, 245, 240, 0.94)',
                boxShadow: 'var(--shadow-float, 0 2px 10px rgba(0,0,0,0.2))',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Jump to latest
            </button>
          ) : null}
        </>
      ) : null}
    </Drawer>
  );
}
