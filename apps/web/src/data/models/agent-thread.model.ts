import type { AgentRunModel } from './agent.model';

export interface AgentThreadModel {
  repositoryId: string;
  slug: string;
  ticketId: string;
  runs: AgentRunModel[];
  replyTo: string | null;
  canReply: boolean;
  cannotReplyReason: string | null;
}
