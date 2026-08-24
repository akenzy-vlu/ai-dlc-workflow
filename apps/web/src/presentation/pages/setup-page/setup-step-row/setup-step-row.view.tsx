import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';

import { accent, semantic, token } from '@app/theme';
import type { SetupStepRowViewProps } from './setup-step-row.props';

const ICONS = {
  done: <CheckCircleFilled style={{ color: semantic.success }} />,
  failed: <CloseCircleFilled style={{ color: semantic.danger }} />,
  running: <LoadingOutlined style={{ color: accent.text }} />,
  pending: <MinusCircleOutlined style={{ color: token.textMuted }} />,
} as const;

export function SetupStepRowView({ title, detail, state }: SetupStepRowViewProps) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0' }}>
      <span style={{ width: 16, paddingTop: 1 }}>{ICONS[state]}</span>
      <span style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: state === 'done' ? token.textSecondary : token.textPrimary }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: token.textMuted }}>{detail}</div>
      </span>
    </div>
  );
}
