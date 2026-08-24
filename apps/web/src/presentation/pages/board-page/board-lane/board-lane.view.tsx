import { Tooltip, Typography } from 'antd';

import { ink, STATUS_COLORS, STATUS_TINTS, token } from '@app/theme';
import { formatHours } from '@domain/value-objects';
import { TicketCard } from '../ticket-card';
import { cardKey, runKey } from '../board-page.model';
import type { BoardLaneViewProps } from './board-lane.props';

export function BoardLaneView({
  label,
  sublabel,
  totalCards,
  totalHours,
  columns,
  properties,
  runFor,
  onLaunch,
  onOpenRun,
}: BoardLaneViewProps) {
  return (
    <section>
      {label ? (
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>
            {label}
          </Typography.Text>
          {sublabel ? (
            <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
              {sublabel}
            </Typography.Text>
          ) : null}
          <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
            {totalCards} tickets · {formatHours(totalHours)}
          </Typography.Text>
        </header>
      ) : null}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 6 }}>
        {columns.map((column) => (
          <section
            key={column.status}
            style={{
              flex: '0 0 288px',
              background: STATUS_TINTS[column.status],
              border: `1px solid ${token.border}`,
              borderRadius: 10,
              padding: 9,
              minHeight: 90,
            }}
          >
            <Tooltip title={column.hint}>
              <header style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 3px 9px' }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: STATUS_COLORS[column.status],
                  }}
                />
                <strong style={{ fontSize: 12 }}>{column.label}</strong>
                <span style={{ color: token.textMuted, fontSize: 11.5 }}>{column.cards.length}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: token.textMuted }}>
                  {formatHours(column.hours)}
                </span>
              </header>
            </Tooltip>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {column.cards.map((card) => (
                <TicketCard
                  key={cardKey(card)}
                  card={card}
                  run={runFor(card)}
                  properties={properties}
                  onLaunch={() => onLaunch(card)}
                  onOpenRun={onOpenRun}
                />
              ))}
              {column.cards.length === 0 ? (
                <div style={{ padding: '10px 4px', fontSize: 11.5, color: ink[400] }}>Nothing here</div>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export { runKey };
