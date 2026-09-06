import { CloseCircleOutlined } from '@ant-design/icons';
import { Button, Descriptions, Drawer, Space, Tag } from 'antd';

import { MONO_FONT, token } from '@app/theme';
import { TERMINAL_RUN_STATUSES } from '@domain/enums';
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
  ticketId,
  status,
  agentLabel,
  repositoryLabel,
  slug,
  cwd,
  cancelling,
  canCancel,
  onCancel,
  onClose,
  children,
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
        ticketId ? (
          <Space size={8} wrap>
            <span style={{ fontFamily: MONO_FONT, fontWeight: 500 }}>{ticketId}</span>
            {status ? (
              <Tag color={STATUS_COLOR[status]} style={{ marginInlineEnd: 0 }}>
                {status}
              </Tag>
            ) : null}
            {agentLabel ? <Tag style={{ marginInlineEnd: 0 }}>{agentLabel}</Tag> : null}
          </Space>
        ) : (
          'Agent thread'
        )
      }
      extra={
        canCancel && (!status || !TERMINAL_RUN_STATUSES.includes(status)) ? (
          <Button danger size="small" icon={<CloseCircleOutlined />} loading={cancelling} onClick={onCancel}>
            Stop
          </Button>
        ) : null
      }
    >
      {ticketId ? (
        <>
          <div style={{ padding: '10px 20px', borderBottom: `1px solid ${token.border}` }}>
            <Descriptions
              size="small"
              column={2}
              colon={false}
              labelStyle={{ color: token.textSecondary, fontSize: 11.5 }}
            >
              <Descriptions.Item label="Repository">
                {repositoryLabel} · {slug}
              </Descriptions.Item>
              <Descriptions.Item label="Working directory">
                <span style={{ fontFamily: MONO_FONT, fontSize: 11 }}>{cwd}</span>
              </Descriptions.Item>
            </Descriptions>
          </div>

          {children}
        </>
      ) : null}
    </Drawer>
  );
}
