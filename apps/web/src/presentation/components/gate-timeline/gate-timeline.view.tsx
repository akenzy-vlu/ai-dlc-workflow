import { CheckCircleFilled, ClockCircleOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';

import { accent, GATE_COLORS, token } from '@app/theme';
import type { GateTimelineViewProps } from './gate-timeline.props';

/**
 * Six gates as a track, with the current position marked.
 *
 * Gates advance in order and never skip, so a linear track is the honest shape: it makes
 * "this feature has been one step from done for a month" visible at a glance, where a
 * status badge never does.
 *
 * Colour carries one message. Passed gates are history and deepen in graphite; gates not
 * yet reached are barely there; the *next* gate is amber, because it is the one waiting
 * on a person. A healthy feature shows exactly one amber block, and a closed one none.
 */
export function GateTimelineView({ steps, onSelect }: GateTimelineViewProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
      {steps.map(({ gate, title, passed, isNext, isSelected }) => (
        <Tooltip key={gate} title={`${gate} — ${title}`}>
          <button
            type="button"
            onClick={onSelect ? () => onSelect(gate) : undefined}
            style={{
              flex: 1,
              cursor: onSelect ? 'pointer' : 'default',
              border: `1px solid ${isSelected ? accent.fill : 'transparent'}`,
              borderRadius: 8,
              padding: '8px 6px',
              background: isNext ? token.bgAccentSoft : passed ? token.bgRaised : 'transparent',
              borderTop: `3px solid ${passed ? GATE_COLORS[gate] : isNext ? accent.fill : token.border}`,
              textAlign: 'left',
              minWidth: 0,
              transition: 'background var(--dur-base) var(--ease)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {passed ? (
                <CheckCircleFilled style={{ color: GATE_COLORS[gate], fontSize: 12 }} />
              ) : isNext ? (
                <ClockCircleOutlined style={{ color: accent.text, fontSize: 12 }} />
              ) : (
                <MinusCircleOutlined style={{ color: token.textMuted, fontSize: 12 }} />
              )}
              <strong
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: passed ? token.textPrimary : isNext ? token.textAccent : token.textMuted,
                }}
              >
                {gate}
              </strong>
            </div>
            <div
              style={{
                fontSize: 11,
                color: token.textMuted,
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </div>
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
