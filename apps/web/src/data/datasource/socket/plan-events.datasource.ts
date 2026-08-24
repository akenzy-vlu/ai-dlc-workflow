import type { AgentLogLine } from '@domain/entities';
import type { AgentRunStatus } from '@domain/enums';
import { toAgentLogLine, toAgentRunStatus } from '../../mappers';
import { getSocket } from './socket-client';

export interface PlanChangedEvent {
  repositoryId: string;
  slug: string | null;
  at: string;
}

export interface GateSweepEvent {
  done: number;
  total: number;
  at: string;
}

export interface AgentRunEvent {
  runId: string;
  status: AgentRunStatus;
  ticketId: string;
  slug: string;
  repositoryId: string;
  /** Null on a status change; a line on output. */
  line: AgentLogLine | null;
  at: string;
}

export interface SetupProgressEvent {
  step: string;
  state: 'running' | 'done' | 'failed';
  line: string | null;
  at: string;
}

export interface PlanEventHandlers {
  onPlanChanged?: (event: PlanChangedEvent) => void;
  onGateSweep?: (event: GateSweepEvent) => void;
  onAgentRun?: (event: AgentRunEvent) => void;
  onSetupProgress?: (event: SetupProgressEvent) => void;
}

/**
 * Subscribes to the server's push channel and returns an unsubscribe.
 *
 * The plan files have three authors — a person in an editor, a planning agent, and this
 * console — so without the push a tab shows a ticket as `todo` minutes after an agent
 * finished it.
 */
export function subscribeToPlanEvents(handlers: PlanEventHandlers): () => void {
  const connection = getSocket();

  const onPlanChanged = (payload: PlanChangedEvent): void => handlers.onPlanChanged?.(payload);
  const onGateSweep = (payload: GateSweepEvent): void => handlers.onGateSweep?.(payload);
  const onSetup = (payload: SetupProgressEvent): void => handlers.onSetupProgress?.(payload);
  const onAgentRun = (payload: {
    runId: string;
    status: string;
    ticketId: string;
    slug: string;
    repositoryId: string;
    line: { at: string; stream: string; text: string } | null;
    at: string;
  }): void =>
    handlers.onAgentRun?.({
      ...payload,
      status: toAgentRunStatus(payload.status),
      line: payload.line ? toAgentLogLine(payload.line) : null,
    });

  connection.on('plan.changed', onPlanChanged);
  connection.on('gates.sweep', onGateSweep);
  connection.on('agent.run', onAgentRun);
  connection.on('setup.progress', onSetup);

  return () => {
    connection.off('plan.changed', onPlanChanged);
    connection.off('gates.sweep', onGateSweep);
    connection.off('agent.run', onAgentRun);
    connection.off('setup.progress', onSetup);
  };
}
