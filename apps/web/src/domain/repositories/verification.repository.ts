import type { ControllerOutcome, EvidenceArchive, EvidenceManifest, RunnerStatus, Verification } from '../entities';
import type { FeatureRef } from '../value-objects';
import type { CommandResult, QueryResult } from './query.types';

export interface VerificationRepository {
  useVerification(ref: FeatureRef | null): QueryResult<Verification>;
  /**
   * `write` generates `08-evidence.md` and the checkbox block G4 counts. Legal only on
   * the `capable` rung — writing it elsewhere produces boxes the project can never tick.
   */
  useRunVerification(): CommandResult<
    FeatureRef & { environments?: string[]; viewports?: string[]; write?: boolean },
    ControllerOutcome
  >;
  useCheckEvidence(): CommandResult<FeatureRef, ControllerOutcome>;
  /** A screenshot URL, served by the API and path-guarded to stay inside `evidence/`. */
  artifactUrl(ref: FeatureRef, relativePath: string): string;

  useArchive(ref: FeatureRef | null): QueryResult<EvidenceArchive>;
  useCreateArchive(): CommandResult<FeatureRef, EvidenceManifest>;
  blobUrl(sha256: string): string;
}

export interface RunnerRepository {
  useRunner(): QueryResult<RunnerStatus>;
  /** Creates a venv, installs Playwright, downloads Chromium. Streams progress. */
  useInstallRunner(): CommandResult<void, { started: boolean; reason?: string }>;
  useUseInterpreter(): CommandResult<string, RunnerStatus>;
}
