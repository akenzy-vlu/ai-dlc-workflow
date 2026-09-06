import { skipToken } from '@reduxjs/toolkit/query/react';

import type { AgentRepository } from '@domain/repositories';
import {
  useCancelAgentRunMutation,
  useGetAgentRunQuery,
  useGetAgentThreadQuery,
  useGetBriefingQuery,
  useLaunchAgentMutation,
  useLaunchReadyTicketsMutation,
  useListAgentRunsQuery,
  useListAgentsQuery,
  useReplyToRunMutation,
} from '../datasource/remote';
import { adaptCommand, adaptQuery } from './adapt';

export const agentRepository: AgentRepository = {
  useAgents: () => adaptQuery(useListAgentsQuery()),
  useRuns: (params) => adaptQuery(useListAgentRunsQuery(params ?? {})),
  useRun: (runId) => adaptQuery(useGetAgentRunQuery(runId ?? skipToken)),
  useBriefing: (ref, ticketId) =>
    adaptQuery(useGetBriefingQuery(ref && ticketId ? { ...ref, ticketId } : skipToken)),
  useThread: (ref, ticketId) =>
    adaptQuery(useGetAgentThreadQuery(ref && ticketId ? { ...ref, ticketId } : skipToken)),

  useReply: () => {
    const [trigger, state] = useReplyToRunMutation();
    return adaptCommand(trigger, state);
  },
  useLaunchReady: () => {
    const [trigger, state] = useLaunchReadyTicketsMutation();
    return adaptCommand(trigger, state);
  },
  useLaunch: () => {
    const [trigger, state] = useLaunchAgentMutation();
    return adaptCommand(trigger, state);
  },
  useCancel: () => {
    const [trigger, state] = useCancelAgentRunMutation();
    return adaptCommand(trigger, state);
  },
};
