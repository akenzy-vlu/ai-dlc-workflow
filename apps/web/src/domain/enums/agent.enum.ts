export const AGENT_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

/** A run that has not reached one of these is still holding a child process open. */
export const TERMINAL_RUN_STATUSES: readonly AgentRunStatus[] = ['succeeded', 'failed', 'cancelled'];

export type AgentLogStream = 'stdout' | 'stderr' | 'console';
