import type { Ticket, TicketGraph } from '@domain/entities';

export interface GraphWavesProps {
  graph: TicketGraph;
  tickets: Ticket[];
}

export interface WaveCard {
  id: string;
  title: string;
  estimateLabel: string;
  status: string;
  onCriticalPath: boolean;
}

export interface GraphWavesViewProps {
  waves: WaveCard[][];
  cycle: string[];
  criticalPathHours: number;
  totalEffortHours: number;
  writeConflicts: TicketGraph['writeConflicts'];
  empty: boolean;
}
