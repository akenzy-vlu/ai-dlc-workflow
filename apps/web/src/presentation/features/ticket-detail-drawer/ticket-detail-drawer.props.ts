import type { Ticket } from '@domain/entities';
import type { FeatureRef } from '@domain/value-objects';

export interface TicketDetailDrawerProps extends FeatureRef {
  /** Null closes the drawer — there is nothing to show and nothing to look up by id. */
  ticket: Ticket | null;
  onClose: () => void;
}

export type TicketDetailDrawerViewProps = TicketDetailDrawerProps;
