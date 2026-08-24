import { Tag, Tooltip } from 'antd';

import type { GateTagViewProps } from './gate-tag.props';

export function GateTagView({ label, tooltip, color, dashed }: GateTagViewProps) {
  return (
    <Tooltip title={tooltip}>
      <Tag
        // A passed gate is history, so it reads as a neutral chip carrying the gate's own
        // depth. Amber is spent on the gate that is *waiting*, which lives on the timeline
        // and in the "→ Gn" chip beside this one — not on every gate everywhere.
        style={{
          fontVariantNumeric: 'tabular-nums',
          color,
          borderColor: 'var(--border)',
          borderStyle: dashed ? 'dashed' : 'solid',
          background: 'var(--bg-raised)',
        }}
      >
        {label}
      </Tag>
    </Tooltip>
  );
}
