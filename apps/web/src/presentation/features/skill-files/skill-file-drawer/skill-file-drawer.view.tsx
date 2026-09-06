import { Drawer } from 'antd';

import { token } from '@app/theme';
import type { SkillFileDrawerViewProps } from './skill-file-drawer.props';

export function SkillFileDrawerView({ open, skillId, onClose, tree, content }: SkillFileDrawerViewProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={skillId ?? 'Skill files'}
      styles={{
        body: { padding: 0, display: 'flex' },
        wrapper: { width: 900 },
      }}
    >
      <div
        style={{
          width: 280,
          flexShrink: 0,
          borderRight: `1px solid ${token.border}`,
          overflow: 'auto',
          padding: 12,
        }}
      >
        {tree}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, minWidth: 0 }}>{content}</div>
    </Drawer>
  );
}
