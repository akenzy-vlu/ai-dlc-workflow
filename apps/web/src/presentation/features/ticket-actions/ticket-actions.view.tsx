import { Button, Checkbox, Input, Modal, Space, Tooltip } from 'antd';

import { TICKET_ACTION_LABELS } from '@domain/enums';
import type { TicketActionsViewProps } from './ticket-actions.props';

export function TicketActionsView({
  ticketId,
  actions,
  compact,
  pending,
  busy,
  blockedByChecklist,
  untickedCount,
  isSelfAccept,
  lastSubmittedBy,
  actor,
  reason,
  noReview,
  onRun,
  onCancel,
  onReasonChange,
  onNoReviewChange,
  onConfirmReject,
  onConfirmDone,
  onConfirmAccept,
}: TicketActionsViewProps) {
  return (
    <>
      <Space size={4} wrap>
        {actions.map((action) => {
          const willBeRefused =
            blockedByChecklist && (action === 'submit' || action === 'done' || action === 'accept');
          return (
            <Tooltip
              key={action}
              title={
                willBeRefused
                  ? `${untickedCount} done-when item(s) still unticked — the controller will refuse this`
                  : action === 'accept' && isSelfAccept
                    ? `${lastSubmittedBy} submitted this — the controller allows a self-accept, and the trail will show both actions under one name`
                    : undefined
              }
            >
              <Button
                size={compact ? 'small' : 'middle'}
                type={action === 'accept' ? 'primary' : 'default'}
                danger={action === 'reject'}
                loading={busy && pending === null}
                onClick={() => onRun(action)}
              >
                {TICKET_ACTION_LABELS[action]}
              </Button>
            </Tooltip>
          );
        })}
      </Space>

      <Modal
        open={pending === 'reject'}
        title={`Reject ${ticketId}`}
        okText="Reject"
        okButtonProps={{ danger: true, disabled: reason.trim().length < 3 }}
        confirmLoading={busy}
        onOk={onConfirmReject}
        onCancel={onCancel}
      >
        <Input.TextArea
          rows={3}
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder="What has to change before this can be accepted?"
        />
      </Modal>

      <Modal
        open={pending === 'done'}
        title={`Mark ${ticketId} done`}
        okText="Mark done"
        confirmLoading={busy}
        onOk={onConfirmDone}
        onCancel={onCancel}
      >
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Going straight to done skips review. The controller records the bypass in the audit trail
          rather than hiding it — which is the point: review lag should be visible as stalled
          parallelism, not quietly routed around.
        </p>
        <Checkbox checked={noReview} onChange={(event) => onNoReviewChange(event.target.checked)}>
          I am working solo on this — skip review
        </Checkbox>
      </Modal>

      <Modal
        open={pending === 'accept'}
        title={`Accept your own submission of ${ticketId}?`}
        okText="Accept anyway"
        confirmLoading={busy}
        onOk={onConfirmAccept}
        onCancel={onCancel}
      >
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          You moved {ticketId} into review yourself. The controller enforces that work passes{' '}
          <em>through</em> review, but it does not compare names, so this will be accepted.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          The audit trail will show the submission and the acceptance both under <strong>{actor}</strong>,
          which is what a reader needs in order to weigh it.
        </p>
      </Modal>
    </>
  );
}
