import { FeatureRef } from '../../../../shared/kernel';
import { EvidenceRun } from '../model/evidence-run';
import { VerificationPlan } from '../model/verification-plan';

export const VERIFICATION_CONTROLLER = Symbol('VERIFICATION_CONTROLLER');

export interface VerificationRunRequest {
  featureDirectory: string;
  environments?: string[];
  viewports?: string[];
  /** Also generate `08-evidence.md` and the `uow.md` checkbox block. */
  write?: boolean;
}

export interface VerificationOutcome {
  accepted: boolean;
  output: string;
  command: string;
  exitCode: number;
}

/**
 * Delegation to `verify.py`. The console decides nothing about rungs or pass rules.
 *
 * `--doctor` — or here, `--json` — is always available and always safe: it reads only.
 * A run is the only method that opens a browser, and the only one that can write.
 */
export interface VerificationControllerPort {
  /** `verify.py <dir> --json`: resolve the rung and what a run would do. Reads only. */
  resolve(ref: FeatureRef, featureDirectory: string): Promise<VerificationPlan>;
  /** `verify.py <dir> [--env ...] [--viewport ...] [--write]`. Opens a browser. */
  run(request: VerificationRunRequest): Promise<VerificationOutcome>;
  /** `evidence_check.py <dir>`: is a ticked checkbox actually supported by run.json? */
  checkEvidence(featureDirectory: string): Promise<VerificationOutcome>;
  /** Whether ai-dlc-verify is installed on this machine at all. */
  isInstalled(): boolean;
}

export const EVIDENCE_READER = Symbol('EVIDENCE_READER');

export interface EvidenceReaderPort {
  read(featureKey: string, featureDirectory: string): Promise<EvidenceRun | null>;
  /** Absolute path of a screenshot, guarded against escaping `evidence/`. */
  resolveArtifact(featureDirectory: string, relativePath: string): string | null;
}
