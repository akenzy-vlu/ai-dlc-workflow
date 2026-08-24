import { RobotOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, List, Modal, Select, Space, Tag, Typography } from 'antd';

import { MONO_FONT, semantic, token } from '@app/theme';
import type { LaunchReadyModalViewProps } from './launch-ready-modal.props';

export function LaunchReadyModalView({
  open,
  candidates,
  actor,
  agents,
  agentsLoading,
  hasAvailableAgent,
  containerized,
  agentId,
  acknowledged,
  launching,
  result,
  onAgentChange,
  onAcknowledgeChange,
  onLaunch,
  onClose,
}: LaunchReadyModalViewProps) {
  // `actor` is the one the server refuses without: the audit trail records a person, and
  // the console has no name of its own to fall back on.
  const canLaunch =
    Boolean(agentId) && Boolean(actor.trim()) && acknowledged && candidates.length > 0 && hasAvailableAgent;

  return (
    <Modal
      open={open}
      title={`Start every pickable ticket (${candidates.length})`}
      onCancel={onClose}
      width={620}
      footer={
        result ? (
          <Button type="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              icon={<RobotOutlined />}
              loading={launching}
              disabled={!canLaunch}
              onClick={onLaunch}
            >
              Launch {candidates.length}
            </Button>
          </Space>
        )
      }
    >
      {result ? (
        <>
          <Alert
            type={result.launched.length > 0 ? 'success' : 'warning'}
            showIcon
            style={{ marginBottom: 12 }}
            title={`${result.launched.length} launched, ${result.skipped.length} held back`}
            description={
              <span style={{ fontSize: 12 }}>
                Each one stops at review. Accepting is still yours, and it is what unblocks
                whatever depends on them.
              </span>
            }
          />
          {result.skipped.length > 0 ? (
            <List
              size="small"
              header={<span style={{ fontSize: 12 }}>Held back</span>}
              dataSource={result.skipped}
              renderItem={(item) => (
                <List.Item>
                  <Space align="start" size={8}>
                    <Tag style={{ fontFamily: MONO_FONT, marginInlineEnd: 0 }}>{item.ticketId}</Tag>
                    <span style={{ fontSize: 12, color: token.textSecondary }}>{item.reason}</span>
                  </Space>
                </List.Item>
              )}
            />
          ) : null}
        </>
      ) : (
        <>
          {!actor.trim() ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              title="Set your name first"
              description={
                <span style={{ fontSize: 12 }}>
                  Every run is attributed to a person, not to the console — use the name control
                  in the top bar.
                </span>
              }
            />
          ) : null}

          {containerized ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              title="Agents run natively, not in Docker"
              description={
                <span style={{ fontSize: 12 }}>
                  Start the console with <code>pnpm dev</code> to launch them.
                </span>
              }
            />
          ) : null}

          {candidates.length === 0 ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              title="Nothing is pickable right now"
              description={
                <span style={{ fontSize: 12 }}>
                  Every remaining ticket is waiting on one that is not done yet. Accept what is in
                  review and the next ones open up.
                </span>
              }
            />
          ) : (
            <>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                One agent per ticket, launched together. The console holds back any ticket that
                writes the same file as another one going out in this batch — two agents editing
                one file with nothing ordering them means one of them loses its work.
              </Typography.Paragraph>

              <Space size={4} wrap style={{ marginBottom: 12 }}>
                {candidates.map((ticket) => (
                  <Tag key={ticket.id} style={{ fontFamily: MONO_FONT, marginInlineEnd: 0 }}>
                    {ticket.id}
                    {ticket.status === 'in_progress' ? (
                      <span style={{ color: semantic.warning }}> · resume</span>
                    ) : null}
                  </Tag>
                ))}
              </Space>
            </>
          )}

          <Select
            style={{ width: '100%', marginBottom: 12 }}
            placeholder="Which agent?"
            loading={agentsLoading}
            value={agentId}
            onChange={onAgentChange}
            options={agents.map((agent) => ({
              value: agent.id,
              label: agent.available ? agent.label : `${agent.label} — not installed`,
              disabled: !agent.available,
            }))}
          />

          <Checkbox checked={acknowledged} onChange={(e) => onAcknowledgeChange(e.target.checked)}>
            <span style={{ fontSize: 12 }}>
              I understand this starts {candidates.length} agent
              {candidates.length === 1 ? '' : 's'} writing code in a real checkout.
            </span>
          </Checkbox>
        </>
      )}
    </Modal>
  );
}
