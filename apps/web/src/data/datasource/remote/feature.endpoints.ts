import type {
  ControllerOutcome,
  CreatedFeature,
  FeatureDetail,
  GateVerdict,
  IntentDraft,
} from '@domain/entities';
import type { TicketAction } from '@domain/enums';
import type { FeatureRef } from '@domain/value-objects';
import type {
  ControllerOutcomeModel,
  CreatedFeatureModel,
  FeatureDetailModel,
  GateVerdictModel,
} from '../../models';
import { toControllerOutcome, toCreatedFeature, toFeatureDetail, toGateVerdict } from '../../mappers';
import { consoleApi } from './api';

const path = (ref: FeatureRef): string =>
  `/features/${encodeURIComponent(ref.repositoryId)}/${encodeURIComponent(ref.slug)}`;

const featureTag = (ref: FeatureRef) => ({ type: 'Feature' as const, id: `${ref.repositoryId}/${ref.slug}` });

/**
 * Tags a write invalidates when it changed one feature.
 *
 * A ticket transition moves counts on the portfolio, the board, the ready queue and the
 * inbox — so those go too. `Repository` and `Project` do not: nothing about a checkout or
 * its grouping changed.
 */
const afterFeatureWrite = (_result: unknown, _error: unknown, arg: FeatureRef) => [
  featureTag(arg),
  'Portfolio' as const,
  'Inbox' as const,
  'ReadyQueue' as const,
  'Board' as const,
  'Audit' as const,
];

export const featureEndpoints = consoleApi.injectEndpoints({
  endpoints: (build) => ({
    getFeature: build.query<FeatureDetail, FeatureRef>({
      query: (ref) => path(ref),
      transformResponse: (model: FeatureDetailModel) => toFeatureDetail(model),
      providesTags: (_result, _error, ref) => [featureTag(ref)],
    }),

    getFeatureDocument: build.query<{ name: string; content: string }, FeatureRef & { name: string }>({
      query: ({ name, ...ref }) => `${path(ref)}/document?name=${encodeURIComponent(name)}`,
    }),

    checkGate: build.mutation<GateVerdict, FeatureRef & { gate: string }>({
      query: ({ gate, ...ref }) => ({ url: `${path(ref)}/gates/${gate}/check`, method: 'POST' }),
      transformResponse: (model: GateVerdictModel) => toGateVerdict(model),
      // A verdict is cached server-side and read back on the feature and the portfolio.
      invalidatesTags: (_r, _e, arg) => [featureTag(arg), 'Portfolio', 'Inbox'],
    }),

    passGate: build.mutation<ControllerOutcome, FeatureRef & { gate: string; by: string }>({
      query: ({ gate, by, ...ref }) => ({
        url: `${path(ref)}/gates/${gate}/pass`,
        method: 'POST',
        body: { by },
      }),
      transformResponse: (model: ControllerOutcomeModel) => toControllerOutcome(model),
      invalidatesTags: afterFeatureWrite,
    }),

    reopenGate: build.mutation<
      ControllerOutcome,
      FeatureRef & { gate: string; by: string; reason: string }
    >({
      query: ({ gate, by, reason, ...ref }) => ({
        url: `${path(ref)}/gates/${gate}/reopen`,
        method: 'POST',
        body: { by, reason },
      }),
      transformResponse: (model: ControllerOutcomeModel) => toControllerOutcome(model),
      invalidatesTags: afterFeatureWrite,
    }),

    transitionTicket: build.mutation<
      ControllerOutcome,
      FeatureRef & {
        ticketId: string;
        action: TicketAction;
        by: string;
        reason?: string;
        noReview?: boolean;
      }
    >({
      query: ({ ticketId, action, by, reason, noReview, ...ref }) => ({
        url: `${path(ref)}/tickets/${ticketId}/transition`,
        method: 'POST',
        body: { action, by, reason, noReview },
      }),
      transformResponse: (model: ControllerOutcomeModel) => toControllerOutcome(model),
      invalidatesTags: afterFeatureWrite,
    }),

    regenerateArtifacts: build.mutation<ControllerOutcome, FeatureRef>({
      query: (ref) => ({ url: `${path(ref)}/regenerate`, method: 'POST' }),
      transformResponse: (model: ControllerOutcomeModel) => toControllerOutcome(model),
      invalidatesTags: afterFeatureWrite,
    }),

    validateGraph: build.mutation<ControllerOutcome, FeatureRef>({
      // Validation reads and reports; it writes nothing, so it invalidates nothing.
      query: (ref) => ({ url: `${path(ref)}/validate`, method: 'POST' }),
      transformResponse: (model: ControllerOutcomeModel) => toControllerOutcome(model),
    }),

    lintTouches: build.mutation<ControllerOutcome, FeatureRef>({
      query: (ref) => ({ url: `${path(ref)}/lint-touches`, method: 'POST' }),
      transformResponse: (model: ControllerOutcomeModel) => toControllerOutcome(model),
    }),

    createFeature: build.mutation<
      CreatedFeature,
      { repositoryId: string; slug: string; profile?: string; intent?: IntentDraft }
    >({
      query: (body) => ({ url: '/features', method: 'POST', body }),
      transformResponse: (model: CreatedFeatureModel) => toCreatedFeature(model),
      invalidatesTags: ['Portfolio', 'Inbox', 'Board'],
    }),
  }),
});

export const {
  useGetFeatureQuery,
  useGetFeatureDocumentQuery,
  useCheckGateMutation,
  usePassGateMutation,
  useReopenGateMutation,
  useTransitionTicketMutation,
  useRegenerateArtifactsMutation,
  useValidateGraphMutation,
  useLintTouchesMutation,
  useCreateFeatureMutation,
} = featureEndpoints;
