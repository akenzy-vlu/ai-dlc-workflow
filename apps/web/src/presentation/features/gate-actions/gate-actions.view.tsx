import { CheckCircleOutlined, RollbackOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Button, Input, Modal, Space, Typography } from 'antd';

import type { GateActionsViewProps } from './gate-actions.props';

export function GateActionsView({
  managed,
  slug,
  currentGate,
  nextGate,
  actor,
  readyToApprove,
  checking,
  passing,
  reopening,
  reopenOpen,
  reopenReason,
  onCheck,
  onPass,
  onOpenReopen,
  onCloseReopen,
  onReopenReasonChange,
  onReopen,
  onSetName,
}: GateActionsViewProps) {
  if (!managed) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        No state file — run <code>aidlc init {slug}</code> in the repository to bring it under the
        controller
      </Typography.Text>
    );
  }

  return (
    <>
      <Space wrap>
        {nextGate ? (
          <Button icon={<SafetyCertificateOutlined />} loading={checking} onClick={onCheck}>
            Check {nextGate}
          </Button>
        ) : null}

        {nextGate ? (
          actor ? (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={passing}
              disabled={!readyToApprove}
              onClick={onPass}
              title={
                readyToApprove
                  ? `Approve ${nextGate} as ${actor}`
                  : `Run "Check ${nextGate}" first — approving without a passing check will just be refused`
              }
            >
              Approve {nextGate}
            </Button>
          ) : (
            <Space size={6}>
              <Button size="small" onClick={onSetName}>
                Set your name to act
              </Button>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                approvals are recorded by name
              </Typography.Text>
            </Space>
          )
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Closed at G5 — nothing further to approve
          </Typography.Text>
        )}

        {currentGate !== 'none' && actor ? (
          <Button danger icon={<RollbackOutlined />} onClick={onOpenReopen}>
            Reopen {currentGate}
          </Button>
        ) : null}
      </Space>

      <Modal
        open={reopenOpen}
        title={`Reopen ${currentGate}`}
        okText="Reopen"
        okButtonProps={{ danger: true, disabled: reopenReason.trim().length < 3 }}
        confirmLoading={reopening}
        onOk={onReopen}
        onCancel={onCloseReopen}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Walking a gate back is recorded permanently in the audit trail, with this reason attached.
          It is the honest move when a plan turns out to be wrong — say what changed.
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          value={reopenReason}
          onChange={(event) => onReopenReasonChange(event.target.value)}
          placeholder="e.g. AC-07 was based on an assumption that turned out false"
        />
      </Modal>
    </>
  );
}
