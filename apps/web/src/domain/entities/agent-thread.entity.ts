import type { AgentRun } from './agent.entity';

/**
 * A ticket's agent work, read as one conversation: runs and replies, oldest first.
 *
 * `canReply` and `cannotReplyReason` are resolved server-side, in
 * `AgentLauncherService.thread()` — never re-derived here. Two copies of the resume rule
 * would drift, and the copy that drifts is the one that offers a reply box for a run that
 * cannot take one.
 */
export interface AgentThread {
  repositoryId: string;
  slug: string;
  ticketId: string;
  runs: AgentRun[];
  /** The run a reply would resume, or null when there is nothing to answer yet. */
  replyTo: string | null;
  canReply: boolean;
  /** Shown to the person verbatim whenever `canReply` is false. */
  cannotReplyReason: string | null;
}

export interface ReplyToRunCommand {
  runId: string;
  message: string;
  repliedBy: string;
  timeoutMinutes?: number;
  /** Same acknowledgement a launch requires. The console will not infer it. */
  acknowledged: boolean;
}
