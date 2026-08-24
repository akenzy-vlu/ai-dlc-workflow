import type { FeatureDetail, GateVerdict, Ticket } from '@domain/entities';

export interface GateVerdictPanelProps {
  verdict: GateVerdict | null;
  /** The whole feature, because a finding that names a ticket can offer to start it. */
  feature: FeatureDetail;
}

export interface GateVerdictPanelViewProps {
  verdict: GateVerdict;
  checkedAtLabel: string;
  /**
   * The ticket a finding is about, or null when it names none.
   *
   * Resolved against the feature's real tickets rather than by pattern-matching the
   * message: `TicketId` is only `T-\S+`, so any regex here would be a guess about a
   * format the controller does not actually promise.
   */
  ticketFor: (message: string) => Ticket | null;
  onLaunch: (ticket: Ticket) => void;
  /** How many tickets a "start all" would launch. Zero hides the button. */
  pickableCount: number;
  onLaunchAll: () => void;
}
