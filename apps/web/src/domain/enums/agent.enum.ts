export const AGENT_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

/** A run that has not reached one of these is still holding a child process open. */
export const TERMINAL_RUN_STATUSES: readonly AgentRunStatus[] = ['succeeded', 'failed', 'cancelled'];

export type AgentLogStream = 'stdout' | 'stderr' | 'console';

export const AGENT_ACTIVITY_KINDS = ['tool', 'text', 'thinking', 'result'] as const;
export type AgentActivityKind = (typeof AGENT_ACTIVITY_KINDS)[number];
