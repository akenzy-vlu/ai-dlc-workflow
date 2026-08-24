export interface VerificationModel {
  installed: boolean;
  runner: { ready: boolean; interpreter: string; blockers: string[] };
  rung: string;
  reason: string;
  canRun: boolean;
  errors: string[];
  warnings: string[];
  environments: {
    name: string;
    url: string;
    enabled: boolean;
    required: boolean;
    writes: boolean;
    recipe: string;
    missing: string[];
    ready: boolean;
  }[];
  viewports: { name: string; width: number; height: number }[];
  stepIds: string[];
  blockedRequired: string[];
  unreadyButNotGating: string[];
  writingEnvironments: string[];
  run: {
    status: string;
    startedAt: string;
    finishedAt: string;
    browser: string;
    commit: string;
    branch: string;
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
    results: {
      environment: string;
      viewport: string;
      step: string;
      verdict: string;
      durationMs: number;
      url: string;
      screenshot: string | null;
      messages: string[];
    }[];
    contactSheets: Record<string, string>;
  } | null;
}

export interface RunnerStatusModel {
  interpreter: string;
  source: string;
  interpreterExists: boolean;
  playwrightInstalled: boolean;
  playwrightVersion: string | null;
  chromiumInstalled: boolean;
  ready: boolean;
  blockers: string[];
  suggestedVenvPath: string;
  venvExists: boolean;
  requirementsPath: string | null;
  installing: boolean;
  steps: { id: string; title: string; detail: string }[];
}

export interface EvidenceManifestModel {
  version: 1;
  repositoryLabel: string;
  slug: string;
  capturedAt: string;
  blobs: { path: string; sha256: string; bytes: number; contentType: string }[];
}

export interface EvidenceArchiveModel {
  manifest: Omit<EvidenceManifestModel, 'blobs'> | null;
  present: number;
  missing: number;
  blobs: { path: string; sha256: string; bytes: number; contentType: string; held: boolean }[];
}
