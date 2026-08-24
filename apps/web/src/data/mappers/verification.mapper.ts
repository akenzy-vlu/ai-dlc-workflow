import type { EvidenceArchive, EvidenceManifest, RunnerStatus, Verification } from '@domain/entities';
import { SETUP_STEP_IDS, type SetupStepId } from '@domain/enums';
import type {
  EvidenceArchiveModel,
  EvidenceManifestModel,
  RunnerStatusModel,
  VerificationModel,
} from '../models';
import { toVerificationRung } from './enum.mapper';

export const toVerification = (model: VerificationModel): Verification => ({
  ...model,
  rung: toVerificationRung(model.rung),
  environments: model.environments ?? [],
  viewports: model.viewports ?? [],
  stepIds: model.stepIds ?? [],
  blockedRequired: model.blockedRequired ?? [],
  unreadyButNotGating: model.unreadyButNotGating ?? [],
  writingEnvironments: model.writingEnvironments ?? [],
});

export const toRunnerStatus = (model: RunnerStatusModel): RunnerStatus => ({
  ...model,
  source: model.source === 'configured' ? 'configured' : 'default',
  blockers: model.blockers ?? [],
  // Steps drive a checklist the user reads while an install runs, so an id the client
  // does not know would render as a blank row. Unknown ids are dropped, not guessed.
  steps: (model.steps ?? []).filter((step): step is { id: SetupStepId; title: string; detail: string } =>
    (SETUP_STEP_IDS as readonly string[]).includes(step.id),
  ),
});

export const toEvidenceManifest = (model: EvidenceManifestModel): EvidenceManifest => ({ ...model });

export const toEvidenceArchive = (model: EvidenceArchiveModel): EvidenceArchive => ({
  manifest: model.manifest,
  present: model.present ?? 0,
  missing: model.missing ?? 0,
  blobs: model.blobs ?? [],
});
