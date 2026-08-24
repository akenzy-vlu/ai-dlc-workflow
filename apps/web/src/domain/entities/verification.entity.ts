import type { SetupStepId, VerificationRung } from '../enums';

export interface VerificationEnvironment {
  name: string;
  url: string;
  enabled: boolean;
  required: boolean;
  /** True when walking this environment mutates real data. */
  writes: boolean;
  recipe: string;
  /** Credential keys this machine does not have. */
  missing: string[];
  ready: boolean;
}

export interface EvidenceResult {
  environment: string;
  viewport: string;
  step: string;
  verdict: string;
  durationMs: number;
  url: string;
  /** Relative to the feature's `evidence/` directory. */
  screenshot: string | null;
  messages: string[];
}

export interface EvidenceRun {
  status: string;
  startedAt: string;
  finishedAt: string;
  browser: string;
  commit: string;
  branch: string;
  /** A run taken against a dirty tree proves less than it appears to. */
  dirty: boolean;
  passed: boolean;
  counts: { pass: number; fail: number; total: number };
  environments: {
    name: string;
    url: string;
    required: boolean;
    writes: boolean;
    recipe: string;
    login: string;
    message: string;
    warmup: { ok: boolean; attempts: number; durationMs: number; status: number; message: string } | null;
  }[];
  viewports: { name: string; width: number; height: number }[];
  steps: { id: string; title: string; path: string; verifies: string[] }[];
  results: EvidenceResult[];
  contactSheets: Record<string, string>;
}

export interface Verification {
  installed: boolean;
  /** Whether this *machine* can drive a browser, as opposed to whether the project is set up to. */
  runner: { ready: boolean; interpreter: string; blockers: string[] };
  rung: VerificationRung;
  reason: string;
  canRun: boolean;
  errors: string[];
  warnings: string[];
  environments: VerificationEnvironment[];
  viewports: { name: string; width: number; height: number }[];
  stepIds: string[];
  blockedRequired: string[];
  /** Unready, but not gating this feature — its spec does not walk them. */
  unreadyButNotGating: string[];
  writingEnvironments: string[];
  run: EvidenceRun | null;
}

export interface SetupStep {
  id: SetupStepId;
  title: string;
  detail: string;
}

export interface RunnerStatus {
  interpreter: string;
  source: 'configured' | 'default';
  interpreterExists: boolean;
  playwrightInstalled: boolean;
  playwrightVersion: string | null;
  chromiumInstalled: boolean;
  ready: boolean;
  /** What is missing, in the order it has to be fixed. */
  blockers: string[];
  suggestedVenvPath: string;
  venvExists: boolean;
  requirementsPath: string | null;
  installing: boolean;
  steps: SetupStep[];
}
