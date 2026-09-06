import type { ReactNode } from 'react';

import type { AgentRunStatus } from '@domain/enums';

export interface AgentRunDrawerProps {
  runId: string | null;
  onClose: () => void;
}

export interface AgentRunDrawerViewProps {
  open: boolean;
  ticketId: string | null;
  /** The latest status in the thread, or the opened run's own — whichever is known. */
  status: AgentRunStatus | null;
  agentLabel: string | null;
  repositoryLabel: string | null;
  slug: string | null;
  cwd: string | null;
  cancelling: boolean;
  /** True when some run in this thread is still going. */
  canCancel: boolean;
  onCancel: () => void;
  onClose: () => void;
  /** The `AgentThread`, composed by the container so this view stays unaware of it. */
  children: ReactNode;
}
