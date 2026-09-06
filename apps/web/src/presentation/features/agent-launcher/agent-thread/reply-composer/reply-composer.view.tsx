import type { KeyboardEvent } from 'react';
import { Button, Input, Space, Typography } from 'antd';
import { Link } from 'react-router-dom';

import { token } from '@app/theme';
import type { ReplyComposerViewProps } from './reply-composer.props';

const MAX_LENGTH = 4000;
const WARN_OVER = 3600;

export function ReplyComposerView({
  value,
  onChange,
  onSend,
  sending,
  canReply,
  cannotReplyReason,
  launchFreshHref,
  acknowledged,
  onAcknowledge,
}: ReplyComposerViewProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!acknowledged) {
      onAcknowledge();
      return;
    }
    onSend();
  };

  if (!canReply) {
    return (
      <div style={{ padding: '10px 20px', borderTop: `1px solid ${token.border}` }}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {cannotReplyReason ?? 'this ticket cannot be replied to right now'}
          </Typography.Text>
          <Link to={launchFreshHref}>
            <Typography.Text style={{ fontSize: 12 }}>Launch a fresh run instead →</Typography.Text>
          </Link>
        </Space>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 20px', borderTop: `1px solid ${token.border}` }}>
      {!acknowledged ? (
        <div
          style={{
            marginBottom: 8,
            padding: '8px 10px',
            borderRadius: 8,
            background: token.bgAccentSoft,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>This sends a message to an agent CLI that writes files in a real checkout.</span>
          <Button size="small" onClick={onAcknowledge}>
            Understood
          </Button>
        </div>
      ) : null}

      <Input.TextArea
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, MAX_LENGTH))}
        onKeyDown={onKeyDown}
        placeholder="Reply to the agent…"
        autoSize={{ minRows: 2, maxRows: 8 }}
        disabled={sending}
      />
      <Space
        align="center"
        style={{ width: '100%', justifyContent: 'space-between', marginTop: 6 }}
      >
        <Typography.Text
          type={value.length > WARN_OVER ? 'warning' : 'secondary'}
          style={{ fontSize: 11 }}
        >
          {value.length > WARN_OVER ? `${value.length} / ${MAX_LENGTH}` : 'Enter to send · Shift+Enter for a new line'}
        </Typography.Text>
        <Button
          type="primary"
          size="small"
          loading={sending}
          disabled={!value.trim()}
          onClick={() => (acknowledged ? onSend() : onAcknowledge())}
        >
          Send
        </Button>
      </Space>
    </div>
  );
}
