import { Alert, Modal, Typography } from 'antd';

import { MONO_FONT, TERMINAL, token } from '@app/theme';
import type { ControllerOutputViewProps } from './controller-output.props';

/**
 * Shows exactly what the controller said.
 *
 * A refusal from `aidlc.py` usually names the file to go and fix — "00-intent.md still
 * has 4 TODO placeholder(s)" — so paraphrasing it into "Action failed" throws away the
 * only useful part. The command is shown too, so the user can re-run it in a terminal and
 * get the same answer: the difference between a tool they can trust and a black box.
 */
export function ControllerOutputView({ outcome, title, open, onClose }: ControllerOutputViewProps) {
  return (
    <Modal open={open} onCancel={onClose} onOk={onClose} title={title} width={760} footer={null}>
      {outcome ? (
        <>
          <Alert
            type={outcome.accepted ? 'success' : 'error'}
            showIcon
            message={outcome.accepted ? 'The controller accepted it' : `Refused (exit ${outcome.exitCode})`}
            style={{ marginBottom: 12 }}
          />
          <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginBottom: 4 }}>
            Ran:
          </Typography.Paragraph>
          <pre
            style={{
              fontFamily: MONO_FONT,
              fontSize: 11,
              background: token.bgRaised,
              padding: 10,
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: '0 0 12px',
            }}
          >
            {outcome.command}
          </pre>
          <pre
            style={{
              fontFamily: MONO_FONT,
              fontSize: 12,
              background: TERMINAL.bg,
              color: TERMINAL.text,
              padding: 12,
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              margin: 0,
              maxHeight: 420,
              overflow: 'auto',
            }}
          >
            {outcome.output || '(no output)'}
          </pre>
        </>
      ) : null}
    </Modal>
  );
}
