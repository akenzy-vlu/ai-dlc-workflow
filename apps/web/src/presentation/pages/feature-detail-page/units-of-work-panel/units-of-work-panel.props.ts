import type { AgentRun, FeatureDetail, Ticket, UnitOfWork } from '@domain/entities';

export interface UnitsOfWorkPanelProps {
  feature: FeatureDetail;
}

export interface UnitsOfWorkPanelViewProps {
  repositoryId: string;
  slug: string;
  unitsOfWork: UnitOfWork[];
  ticketsOf: (uow: UnitOfWork) => Ticket[];
  runFor: (ticketId: string) => AgentRun | undefined;
  defaultOpenKeys: string[];
  launchFor: Ticket | null;
  openRunId: string | null;
  openTicket: Ticket | null;
  onLaunch: (ticket: Ticket | null) => void;
  onOpenRun: (runId: string | null) => void;
  onOpenTicket: (ticket: Ticket | null) => void;
}
