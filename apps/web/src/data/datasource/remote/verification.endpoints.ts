import type {
  ActingIdentityMode,
  ControllerOutcome,
  EvidenceArchive,
  EvidenceManifest,
  RunnerStatus,
  ToolingStatus,
  Verification,
} from '@domain/entities';
import type { FeatureRef } from '@domain/value-objects';
import type {
  ControllerOutcomeModel,
  EvidenceArchiveModel,
  EvidenceManifestModel,
  RunnerStatusModel,
  VerificationModel,
} from '../../models';
import {
  toControllerOutcome,
  toEvidenceArchive,
  toEvidenceManifest,
  toRunnerStatus,
  toVerification,
} from '../../mappers';
import { consoleApi } from './api';

const path = (ref: FeatureRef): string =>
  `/features/${encodeURIComponent(ref.repositoryId)}/${encodeURIComponent(ref.slug)}`;

export const verificationEndpoints = consoleApi.injectEndpoints({
  endpoints: (build) => ({
    getVerification: build.query<Verification, FeatureRef>({
      query: (ref) => `${path(ref)}/verification`,
      transformResponse: (model: VerificationModel) => toVerification(model),
      providesTags: (_r, _e, ref) => [{ type: 'Verification', id: `${ref.repositoryId}/${ref.slug}` }],
    }),

    runVerification: build.mutation<
      ControllerOutcome,
      FeatureRef & { environments?: string[]; viewports?: string[]; write?: boolean }
    >({
      query: ({ repositoryId, slug, ...body }) => ({
        url: `${path({ repositoryId, slug })}/verification/run`,
        method: 'POST',
        body,
      }),
      transformResponse: (model: ControllerOutcomeModel) => toControllerOutcome(model),
      // A `--write` run appends checkboxes to uow.md, which is a G4 precondition, so the
      // feature itself moves too — not just the verification panel.
      invalidatesTags: (_r, _e, arg) => [
        { type: 'Verification', id: `${arg.repositoryId}/${arg.slug}` },
        { type: 'Feature', id: `${arg.repositoryId}/${arg.slug}` },
        'EvidenceArchive',
        'Portfolio',
        'Inbox',
      ],
    }),

    checkEvidence: build.mutation<ControllerOutcome, FeatureRef>({
      query: (ref) => ({ url: `${path(ref)}/verification/check-evidence`, method: 'POST' }),
      transformResponse: (model: ControllerOutcomeModel) => toControllerOutcome(model),
    }),

    getEvidenceArchive: build.query<EvidenceArchive, FeatureRef>({
      query: (ref) => `${path(ref)}/verification/archive`,
      transformResponse: (model: EvidenceArchiveModel) => toEvidenceArchive(model),
      providesTags: (_r, _e, ref) => [
        { type: 'EvidenceArchive', id: `${ref.repositoryId}/${ref.slug}` },
      ],
    }),

    createEvidenceArchive: build.mutation<EvidenceManifest, FeatureRef>({
      query: (ref) => ({ url: `${path(ref)}/verification/archive`, method: 'POST' }),
      transformResponse: (model: EvidenceManifestModel) => toEvidenceManifest(model),
      invalidatesTags: (_r, _e, ref) => [
        { type: 'EvidenceArchive', id: `${ref.repositoryId}/${ref.slug}` },
      ],
    }),

    getRunner: build.query<RunnerStatus, void>({
      query: () => '/runner',
      transformResponse: (model: RunnerStatusModel) => toRunnerStatus(model),
      providesTags: ['Runner'],
    }),

    installRunner: build.mutation<{ started: boolean; reason?: string }, void>({
      // Returns as soon as it starts; progress arrives on the socket. Holding an HTTP
      // request open for a Chromium download just times out somewhere less informative.
      query: () => ({ url: '/runner/install', method: 'POST' }),
    }),

    useInterpreter: build.mutation<RunnerStatus, string>({
      query: (interpreter) => ({
        url: '/runner/use-interpreter',
        method: 'POST',
        body: { interpreter },
      }),
      transformResponse: (model: RunnerStatusModel) => toRunnerStatus(model),
      invalidatesTags: ['Runner', 'Verification'],
    }),

    getMaintenanceStatus: build.query<
      {
        tooling: ToolingStatus;
        cachedGateVerdicts: number;
        sweeping: boolean;
        identity: ActingIdentityMode;
      },
      void
    >({
      query: () => '/maintenance/status',
      providesTags: ['Tooling'],
    }),

    refreshCaches: build.mutation<{ refreshed: boolean }, void>({
      query: () => ({ url: '/maintenance/refresh', method: 'POST' }),
      invalidatesTags: ['Portfolio', 'Inbox', 'ReadyQueue', 'Board', 'Feature', 'Audit', 'Tooling'],
    }),

    sweepGates: build.mutation<{ started: boolean; reason?: string }, void>({
      query: () => ({ url: '/maintenance/sweep-gates', method: 'POST' }),
    }),
  }),
});

export const {
  useGetVerificationQuery,
  useRunVerificationMutation,
  useCheckEvidenceMutation,
  useGetEvidenceArchiveQuery,
  useCreateEvidenceArchiveMutation,
  useGetRunnerQuery,
  useInstallRunnerMutation,
  useUseInterpreterMutation,
  useGetMaintenanceStatusQuery,
  useRefreshCachesMutation,
  useSweepGatesMutation,
} = verificationEndpoints;

/** Screenshots and blobs are plain GETs the browser fetches directly, not through RTKQ. */
export const artifactUrl = (ref: FeatureRef, relativePath: string): string =>
  `/api${path(ref)}/verification/artifact?path=${encodeURIComponent(relativePath)}`;

export const blobUrl = (sha256: string): string => `/api/evidence/${sha256}`;
