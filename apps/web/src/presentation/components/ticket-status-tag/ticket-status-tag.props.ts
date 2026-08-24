import type { WorkStatus } from '@domain/enums';

export interface TicketStatusTagProps {
  status: WorkStatus;
}

export interface TicketStatusTagViewProps {
  label: string;
  tooltip: string;
  color: string;
  background: string;
  borderColor: string;
}
