import { accent, semantic, STATUS_COLORS, token } from '@app/theme';
import { WORK_STATUS_HINTS, WORK_STATUS_LABELS } from '@domain/enums';
import type { TicketStatusTagProps } from './ticket-status-tag.props';
import { TicketStatusTagView } from './ticket-status-tag.view';

/**
 * `review` is the only status a person has to act on, so it is the only one that gets the
 * accent. Everything else is depth of graphite — active work is not more important than
 * finished work, it is just less finished.
 */
export function TicketStatusTag({ status }: TicketStatusTagProps) {
  const awaitingHuman = status === 'review';
  const broken = status === 'blocked';

  return (
    <TicketStatusTagView
      label={WORK_STATUS_LABELS[status].toLowerCase()}
      tooltip={WORK_STATUS_HINTS[status]}
      color={awaitingHuman ? accent.text : broken ? semantic.danger : STATUS_COLORS[status]}
      background={awaitingHuman ? token.bgAccentSoft : token.bgRaised}
      borderColor={awaitingHuman ? accent.fill : broken ? semantic.danger : token.border}
    />
  );
}
