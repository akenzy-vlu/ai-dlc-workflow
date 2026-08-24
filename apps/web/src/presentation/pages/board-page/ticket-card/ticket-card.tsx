import { ROUTES } from '@app/router/routes';
import { TERMINAL_RUN_STATUSES } from '@domain/enums';
import type { TicketCardProps } from './ticket-card.props';
import { TicketCardView } from './ticket-card.view';

export function TicketCard({ card, run, properties, onLaunch, onOpenRun }: TicketCardProps) {
  return (
    <TicketCardView
      card={card}
      run={run}
      properties={properties}
      ticketPath={`${ROUTES.feature(card.repositoryId, card.featureSlug)}?ticket=${card.ticketId}`}
      waiting={card.status === 'todo' && card.unmetDependencies > 0}
      working={run !== undefined && !TERMINAL_RUN_STATUSES.includes(run.status)}
      checkoutSummary={card.checkouts
        .map((checkout) => `${checkout.repositoryLabel}${checkout.branch ? ` (${checkout.branch})` : ''}: ${checkout.status}`)
        .join('\n')}
      shows={(key) => properties.includes(key)}
      onLaunch={onLaunch}
      onOpenRun={onOpenRun}
    />
  );
}
