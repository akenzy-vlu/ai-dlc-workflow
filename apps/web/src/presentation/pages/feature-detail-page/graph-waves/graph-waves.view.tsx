import { Card, Empty, Space, Tag, Tooltip, Typography } from 'antd';

import { MONO_FONT, token } from '@app/theme';
import { formatHours } from '@domain/value-objects';
import type { GraphWavesViewProps } from './graph-waves.props';

/**
 * Wave cards, as depth rather than hue.
 *
 * A five-colour status palette here would put five saturated fills on one screen and
 * drown the single one that means something. Only `review` is tinted — the work has
 * stopped and is waiting for a person — and only `blocked` breaks into a second colour,
 * because it is genuinely wrong rather than merely unfinished.
 */
const STATUS_BG: Record<string, string> = {
  todo: 'var(--bg-surface)',
  in_progress: 'var(--bg-raised)',
  review: 'var(--bg-accent-soft)',
  done: 'var(--bg-raised)',
  blocked: 'var(--bg-surface)',
};
const STATUS_BORDER: Record<string, string> = {
  todo: 'var(--border)',
  in_progress: 'var(--border-strong)',
  review: 'var(--accent-fill)',
  done: 'var(--border)',
  blocked: 'var(--danger)',
};

export function GraphWavesView({
  waves,
  cycle,
  criticalPathHours,
  totalEffortHours,
  writeConflicts,
  empty,
}: GraphWavesViewProps) {
  if (empty) {
    return (
      <Card size="small">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tickets to graph" />
      </Card>
    );
  }

  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      {cycle.length > 0 ? (
        <Card size="small" style={{ borderColor: 'var(--danger)' }}>
          <Typography.Text strong style={{ color: 'var(--danger)' }}>
            Dependency cycle
          </Typography.Text>
          <div style={{ fontFamily: MONO_FONT, fontSize: 12, marginTop: 4 }}>{cycle.join(' -> ')}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            G3 will refuse this plan, and every ordering number on this page is meaningless until it
            is broken.
          </Typography.Text>
        </Card>
      ) : null}

      <Card
        size="small"
        title="Execution waves"
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            critical path {formatHours(criticalPathHours)} · total effort {formatHours(totalEffortHours)}
          </Typography.Text>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -4 }}>
          A wave is a topological level, not a schedule — everything in one wave has its dependencies
          met by the waves before it.
        </Typography.Paragraph>

        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {waves.map((wave, index) => (
            <div key={index} style={{ minWidth: 210, flex: '0 0 auto' }}>
              <div
                style={{
                  fontSize: 11,
                  color: token.textMuted,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                Wave {index + 1} · {wave.length}
              </div>
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                {wave.map((card) => (
                  <Tooltip key={card.id} title={card.title}>
                    <div
                      style={{
                        border: `1px solid ${STATUS_BORDER[card.status]}`,
                        // The critical path is weight, not hue: a chain that decides the
                        // finish date deserves emphasis, but a colour for it would compete
                        // with amber, and amber has a job here.
                        borderLeft: `3px solid ${card.onCriticalPath ? token.borderStrong : 'transparent'}`,
                        background: STATUS_BG[card.status],
                        borderRadius: 8,
                        padding: '5px 8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontFamily: MONO_FONT, fontSize: 11.5, fontWeight: 500 }}>
                          {card.id}
                        </span>
                        <span style={{ fontSize: 11, color: token.textMuted }}>{card.estimateLabel}</span>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: token.textSecondary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {card.title}
                      </div>
                    </div>
                  </Tooltip>
                ))}
              </Space>
            </div>
          ))}
        </div>
      </Card>

      {writeConflicts.length > 0 ? (
        <Card size="small" title={`Parallel write collisions · ${writeConflicts.length}`}>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -4 }}>
            Pairs with no dependency between them that write the same file. Wave membership does not
            protect against this: two tickets in different waves with no path between them can still
            be in flight at once, and then one of them loses its work.
          </Typography.Paragraph>
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            {writeConflicts.slice(0, 60).map((conflict) => (
              <div
                key={`${conflict.a}-${conflict.b}`}
                style={{ fontSize: 12, padding: '4px 0', borderBottom: `1px solid ${token.border}` }}
              >
                <Space size={6} wrap>
                  <Tag style={{ fontFamily: MONO_FONT, marginInlineEnd: 0 }}>{conflict.a}</Tag>
                  <span style={{ color: token.textMuted }}>×</span>
                  <Tag style={{ fontFamily: MONO_FONT, marginInlineEnd: 0 }}>{conflict.b}</Tag>
                  <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: token.textMuted }}>
                    {conflict.paths.join(', ')}
                  </span>
                </Space>
              </div>
            ))}
            {writeConflicts.length > 60 ? (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                …and {writeConflicts.length - 60} more
              </Typography.Text>
            ) : null}
          </div>
        </Card>
      ) : null}
    </Space>
  );
}
