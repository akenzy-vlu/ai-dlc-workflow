import type { AgentDefinition, AgentRun, AgentRunDetail, AgentThread, LaunchAgentCommand, ReplyToRunCommand } from '@domain/entities';
import type { FeatureRef } from '@domain/value-objects';
import type { AgentDefinitionModel, AgentRunDetailModel, AgentRunModel, AgentThreadModel } from '../../models';
import { toAgentDefinition, toAgentRun, toAgentRunDetail, toAgentThread } from '../../mappers';
import { consoleApi } from './api';

const path = (ref: FeatureRef): string =>
  `/features/${encodeURIComponent(ref.repositoryId)}/${encodeURIComponent(ref.slug)}`;

export const agentEndpoints = consoleApi.injectEndpoints({
  endpoints: (build) => ({
    listAgents: build.query<AgentDefinition[], void>({
      query: () => '/agents',
      transformResponse: (models: AgentDefinitionModel[]) => models.map(toAgentDefinition),
      providesTags: ['Agent'],
    }),

    listAgentRuns: build.query<
      AgentRun[],
      { repositoryId?: string; slug?: string; ticketId?: string; active?: boolean } | void
    >({
      query: (params) => {
        const search = new URLSearchParams(
          Object.entries(params ?? {})
            .filter(([, value]) => value !== undefined && value !== '')
            .map(([key, value]) => [key, String(value)]),
        ).toString();
        return `/agent-runs${search ? `?${search}` : ''}`;
      },
      transformResponse: (models: AgentRunModel[]) => models.map(toAgentRun),
      providesTags: ['AgentRun'],
    }),

    getAgentRun: build.query<AgentRunDetail, string>({
      query: (runId) => `/agent-runs/${runId}`,
      transformResponse: (model: AgentRunDetailModel) => toAgentRunDetail(model),
      providesTags: (_result, _error, runId) => [{ type: 'AgentRun', id: runId }],
    }),

    getBriefing: build.query<{ briefing: string }, FeatureRef & { ticketId: string }>({
      query: ({ ticketId, ...ref }) => `${path(ref)}/tickets/${ticketId}/briefing`,
    }),

    getAgentThread: build.query<AgentThread, FeatureRef & { ticketId: string }>({
      query: ({ ticketId, ...ref }) => `${path(ref)}/tickets/${ticketId}/thread`,
      transformResponse: (model: AgentThreadModel) => toAgentThread(model),
      providesTags: (_result, _error, arg) => [{ type: 'AgentRun', id: arg.ticketId }],
    }),

    replyToRun: build.mutation<{ runId: string }, ReplyToRunCommand>({
      query: ({ runId, ...body }) => ({ url: `/agent-runs/${runId}/reply`, method: 'POST', body }),
      // The bare type, matching `cancelAgentRun` below: the thread is tagged by ticketId,
      // not by the runId a reply is posted to, and only invalidating the untyped 'AgentRun'
      // tag reaches every id under it — a reply changes nothing else the console shows, so
      // this stays narrower than launch's invalidation, which moves the ticket itself.
      invalidatesTags: (_result, _error, arg) => ['AgentRun', { type: 'AgentRun', id: arg.runId }],
    }),

    launchAgent: build.mutation<{ runId: string }, FeatureRef & { ticketId: string } & LaunchAgentCommand>({
      query: ({ ticketId, repositoryId, slug, ...body }) => ({
        url: `${path({ repositoryId, slug })}/tickets/${ticketId}/launch-agent`,
        method: 'POST',
        body,
      }),
      // Launching moves the ticket to in_progress through the controller first, so the
      // feature and every count derived from it are already stale by the time this returns.
      invalidatesTags: (_r, _e, arg) => [
        'AgentRun',
        { type: 'Feature', id: `${arg.repositoryId}/${arg.slug}` },
        'Portfolio',
        'Board',
        'ReadyQueue',
        'Audit',
      ],
    }),

    cancelAgentRun: build.mutation<{ cancelled: boolean }, string>({
      query: (runId) => ({ url: `/agent-runs/${runId}/cancel`, method: 'POST' }),
      invalidatesTags: (_result, _error, runId) => ['AgentRun', { type: 'AgentRun', id: runId }],
    }),
    launchReadyTickets: build.mutation<
      { launched: { ticketId: string; runId: string }[]; skipped: { ticketId: string; reason: string }[] },
      {
        repositoryId: string;
        slug: string;
        agentId: string;
        /** Who is launching. The audit trail records a person, never the console. */
        launchedBy: string;
        extraInstructions?: string;
        timeoutMinutes?: number;
        acknowledged: boolean;
      }
    >({
      query: ({ repositoryId, slug, ...body }) => ({
        url: `/features/${encodeURIComponent(repositoryId)}/${encodeURIComponent(slug)}/launch-ready`,
        method: 'POST',
        body,
      }),
      // Several tickets move to in_progress at once; every view of this feature is stale.
      invalidatesTags: ['Feature', 'AgentRun', 'Agent', 'Board', 'Inbox', 'ReadyQueue', 'Portfolio'],
    }),
  }),
});

export const {
  useListAgentsQuery,
  useListAgentRunsQuery,
  useGetAgentRunQuery,
  useGetBriefingQuery,
  useGetAgentThreadQuery,
  useReplyToRunMutation,
  useLaunchAgentMutation,
  useLaunchReadyTicketsMutation,
  useCancelAgentRunMutation,
} = agentEndpoints;
