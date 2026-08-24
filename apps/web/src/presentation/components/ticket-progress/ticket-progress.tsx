import { ink, semantic, token } from '@app/theme';
import type { TicketProgressProps } from './ticket-progress.props';
import { TicketProgressView } from './ticket-progress.view';

export function TicketProgress({ done, total }: TicketProgressProps) {
  const complete = total > 0 && done === total;
  return (
    <TicketProgressView
      done={done}
      total={total}
      empty={total === 0}
      color={complete ? semantic.success : done === 0 ? token.textMuted : ink[500]}
    />
  );
}
