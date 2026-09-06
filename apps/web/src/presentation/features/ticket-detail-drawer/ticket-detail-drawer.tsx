import type { TicketDetailDrawerProps } from './ticket-detail-drawer.props';
import { TicketDetailDrawerView } from './ticket-detail-drawer.view';

/**
 * A ticket's full content, read-only, next to the row that opened it.
 *
 * No data-fetching of its own: the ticket is already part of `FeatureDetail`, which
 * `UnitsOfWorkPanel` holds in memory — passing it straight through, rather than a second
 * endpoint, is the point of ADR-01. This container exists to keep the same
 * container/view/props shape every other feature here uses, not because there is logic to
 * keep out of the view.
 */
export function TicketDetailDrawer(props: TicketDetailDrawerProps) {
  return <TicketDetailDrawerView {...props} />;
}
