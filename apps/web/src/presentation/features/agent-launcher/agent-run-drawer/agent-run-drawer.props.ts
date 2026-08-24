import type { AgentLogLine, AgentRunDetail } from '@domain/entities';

export interface AgentRunDrawerProps {
  runId: string | null;
  onClose: () => void;
}

export interface AgentRunDrawerViewProps {
  open: boolean;
  run: AgentRunDetail | undefined;
  lines: AgentLogLine[];
  cancelling: boolean;
  follow: boolean;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  onFollowAgain: () => void;
  onCancel: () => void;
  onClose: () => void;
}
