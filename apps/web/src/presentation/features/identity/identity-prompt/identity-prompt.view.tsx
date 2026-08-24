import { UserOutlined } from '@ant-design/icons';
import { Alert, Input, Modal } from 'antd';

import type { IdentityPromptViewProps } from './identity-prompt.props';

export function IdentityPromptView({
  open,
  draft,
  onDraftChange,
  onConfirm,
  onCancel,
}: IdentityPromptViewProps) {
  return (
    <Modal
      open={open}
      title="Who is acting?"
      onCancel={onCancel}
      onOk={onConfirm}
      okText="Save"
      okButtonProps={{ disabled: draft.trim().length === 0 }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="This name goes into the audit trail"
        description="Every gate approval and ticket transition is recorded with it, permanently, in the repository's own state file. Use the name your team would recognise."
      />
      <Input
        autoFocus
        prefix={<UserOutlined />}
        placeholder="e.g. Akenzy"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onPressEnter={() => draft.trim() && onConfirm()}
      />
    </Modal>
  );
}
