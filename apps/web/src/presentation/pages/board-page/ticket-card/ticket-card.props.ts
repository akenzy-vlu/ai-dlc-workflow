import type { AgentRun, BoardCard } from '@domain/entities';

export interface TicketCardProps {
  card: BoardCard;
  run?: AgentRun;
  properties: string[];
  onLaunch: () => void;
  onOpenRun: (runId: string) => void;
}

export interface TicketCardViewProps extends TicketCardProps {
  ticketPath: string;
  waiting: boolean;
  working: boolean;
  checkoutSummary: string;
  shows: (key: string) => boolean;
}
