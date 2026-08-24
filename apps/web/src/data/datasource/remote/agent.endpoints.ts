import type { AgentDefinition, AgentRun, AgentRunDetail, LaunchAgentCommand } from '@domain/entities';
import type { FeatureRef } from '@domain/value-objects';
import type { AgentDefinitionModel, AgentRunDetailModel, AgentRunModel } from '../../models';
import { toAgentDefinition, toAgentRun, toAgentRunDetail } from '../../mappers';
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
  useLaunchAgentMutation,
  useLaunchReadyTicketsMutation,
  useCancelAgentRunMutation,
} = agentEndpoints;
