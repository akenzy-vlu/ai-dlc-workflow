import type { ReactNode } from 'react';

import type { AgentActivity, AgentLogLine, AgentRun } from '@domain/entities';

export interface AgentThreadProps {
  repositoryId: string;
  slug: string;
  ticketId: string;
}

export interface AgentThreadViewProps {
  loading: boolean;
  /** True once loaded and no run has ever touched this ticket. */
  empty: boolean;
  follow: boolean;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  onFollowAgain: () => void;
  /** The rendered entries — `ThreadEntry` instances, composed by the container. */
  children: ReactNode;
}

export interface ThreadEntryViewProps {
  run: AgentRun;
  lines: AgentLogLine[];
  /**
   * The live-merged answer to "what is it doing right now" — the fetched snapshot until
   * the socket has said anything, the socket's own word (activity or null) after.
   */
  currentActivity: AgentActivity | null;
}
