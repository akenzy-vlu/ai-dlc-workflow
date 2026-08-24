import type { AgentDefinition } from '@domain/entities';
import type { FeatureRef } from '@domain/value-objects';

export interface LaunchAgentModalProps extends FeatureRef {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  ticketTitle: string;
  onLaunched?: (runId: string) => void;
}

export interface LaunchAgentModalViewProps {
  open: boolean;
  ticketId: string;
  ticketTitle: string;
  actor: string;
  agents: AgentDefinition[];
  agentsLoading: boolean;
  hasAvailableAgent: boolean;
  /** The API is in a container, where a CLI installed on the host cannot be reached. */
  containerized: boolean;
  agentId: string | undefined;
  extraInstructions: string;
  timeoutMinutes: number | null;
  acknowledged: boolean;
  briefing: string | undefined;
  launching: boolean;
  onAgentChange: (agentId: string) => void;
  onExtraChange: (value: string) => void;
  onTimeoutChange: (value: number | null) => void;
  onAcknowledgeChange: (value: boolean) => void;
  onLaunch: () => void;
  onClose: () => void;
}
