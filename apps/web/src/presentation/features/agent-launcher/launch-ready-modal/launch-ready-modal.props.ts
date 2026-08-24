import type { AgentDefinition, Ticket } from '@domain/entities';

export interface LaunchReadyModalProps {
  open: boolean;
  repositoryId: string;
  slug: string;
  /** Every ticket in the feature; the pickable ones are derived here for the preview. */
  tickets: Ticket[];
  onClose: () => void;
}

export interface LaunchReadyModalViewProps {
  open: boolean;
  /** What the server is expected to launch. It decides authoritatively. */
  candidates: Ticket[];
  agents: AgentDefinition[];
  agentsLoading: boolean;
  /** Empty until a name is set; a run is attributed to a person, not to the console. */
  actor: string;
  hasAvailableAgent: boolean;
  containerized: boolean;
  agentId: string | undefined;
  acknowledged: boolean;
  launching: boolean;
  result: { launched: { ticketId: string }[]; skipped: { ticketId: string; reason: string }[] } | null;
  onAgentChange: (id: string) => void;
  onAcknowledgeChange: (value: boolean) => void;
  onLaunch: () => void;
  onClose: () => void;
}
