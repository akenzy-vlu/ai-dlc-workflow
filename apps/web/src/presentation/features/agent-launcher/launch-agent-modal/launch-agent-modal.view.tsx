import { RobotOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, Checkbox, Collapse, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';

import { MONO_FONT, token } from '@app/theme';
import type { LaunchAgentModalViewProps } from './launch-agent-modal.props';

/**
 * Two things this dialog insists on.
 *
 * The brief is shown before launch, because it is the whole difference between this and
 * pasting into a terminal — it carries the slice's demo script, the acceptance criteria
 * and the file list, and it is worth twenty seconds of reading. And the acknowledgement
 * is a real checkbox, not a formality: the agent writes files in a real checkout, and a
 * launch that fires on one click is how a repository nobody meant to point it at gets
 * rewritten.
 */
export function LaunchAgentModalView({
  open,
  ticketId,
  ticketTitle,
  actor,
  agents,
  agentsLoading,
  hasAvailableAgent,
  containerized,
  agentId,
  extraInstructions,
  timeoutMinutes,
  acknowledged,
  briefing,
  launching,
  onAgentChange,
  onExtraChange,
  onTimeoutChange,
  onAcknowledgeChange,
  onLaunch,
  onClose,
}: LaunchAgentModalViewProps) {
  return (
    <Modal
      open={open}
      title={
        <span>
          <RobotOutlined /> Hand {ticketId} to an agent
        </span>
      }
      width={720}
      onCancel={onClose}
      okText="Start the agent"
      okButtonProps={{ disabled: !agentId || !acknowledged || !actor }}
      confirmLoading={launching}
      onOk={onLaunch}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12.5 }}>
        {ticketTitle}
      </Typography.Paragraph>

      {!actor ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Set your name first — a run is attributed to a person, not to the console."
        />
      ) : null}

      {!hasAvailableAgent && !agentsLoading ? (
        containerized ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            title="Agents run natively, not in Docker"
            description={
              <span style={{ fontSize: 12 }}>
                The CLIs are not in this image, and one installed on your machine is not
                reachable from inside it. Your agents are listed below — start the console with{' '}
                <code>pnpm dev</code> to launch them.
              </span>
            }
          />
        ) : (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            title="No agent CLI found on this machine"
            description={
              <span style={{ fontSize: 12 }}>
                The console drives agent CLIs; it does not ship them. Install and sign into one —
                Claude Code, Codex, Cursor — or declare your own in{' '}
                <code>~/.aidlc-console/agents.json</code>.
              </span>
            }
          />
        )
      ) : null}

      <Form layout="vertical">
        <Form.Item label="Agent">
          <Select
            placeholder="Which agent?"
            value={agentId}
            onChange={onAgentChange}
            loading={agentsLoading}
            options={agents.map((agent) => ({
              value: agent.id,
              label: agent.available ? agent.label : `${agent.label} — not installed`,
              disabled: !agent.available,
            }))}
          />
        </Form.Item>

        <Form.Item label="Anything the plan does not say" extra="Optional. Appended to the brief below.">
          <Input.TextArea
            rows={2}
            value={extraInstructions}
            onChange={(event) => onExtraChange(event.target.value)}
            placeholder="The staging DB is seeded — do not re-run the migration"
          />
        </Form.Item>

        <Form.Item label="Stop after" extra="Minutes. A hung CLI is killed rather than left on the machine.">
          <InputNumber min={1} max={180} value={timeoutMinutes} onChange={onTimeoutChange} style={{ width: 120 }} />
        </Form.Item>
      </Form>

      <Collapse
        size="small"
        style={{ marginBottom: 14 }}
        items={[
          {
            key: 'brief',
            label: `The brief this agent receives (${briefing?.split('\n').length ?? 0} lines)`,
            children: (
              <pre
                style={{
                  margin: 0,
                  maxHeight: 300,
                  overflow: 'auto',
                  fontFamily: MONO_FONT,
                  fontSize: 11.5,
                  whiteSpace: 'pre-wrap',
                  color: token.textSecondary,
                }}
              >
                {briefing ?? 'loading…'}
              </pre>
            ),
          },
        ]}
      />

      <Alert
        type="warning"
        icon={<WarningOutlined />}
        showIcon
        message={
          <Checkbox checked={acknowledged} onChange={(event) => onAcknowledgeChange(event.target.checked)}>
            I understand this runs a real agent CLI that writes files in this checkout
          </Checkbox>
        }
        description={
          <span style={{ fontSize: 12 }}>
            The console moves the ticket to <code>in_progress</code> under the agent's name first — if
            the controller refuses (gate below G3, a dependency not done), nothing starts. When the
            agent finishes, a person still has to review and accept the work.
          </span>
        }
      />
    </Modal>
  );
}
