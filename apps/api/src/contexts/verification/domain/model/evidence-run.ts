import { Entity } from '../../../../shared/kernel';

export interface StepResult {
  environment: string;
  viewport: string;
  step: string;
  /** `pass` | `fail` — anything else came from a newer runner and is shown as-is. */
  verdict: string;
  durationMs: number;
  url: string;
  /** Path relative to the feature's `evidence/` directory. */
  screenshot: string | null;
  messages: string[];
}

export interface EnvironmentOutcome {
  name: string;
  url: string;
  required: boolean;
  writes: boolean;
  recipe: string;
  login: string;
  message: string;
  /**
   * One request before the session is established, whose result no verdict derives from.
   * It exists so a cold load balancer is recorded as a duration rather than mislabelled
   * as a flaky step — and it retries only on transport failure or 502/503/504, capped,
   * so it can never start absorbing real regressions.
   */
  warmup: { ok: boolean; attempts: number; durationMs: number; status: number; message: string } | null;
}

/**
 * A completed run, read back from `evidence/run.json`.
 *
 * Screenshots are captured on failure too: a red step's screenshot *is* the defect
 * report, and a green-only runner discards the most useful artifact of a bad run.
 */
export class EvidenceRun extends Entity<string> {
  private constructor(
    id: string,
    readonly status: string,
    readonly startedAt: string,
    readonly finishedAt: string,
    readonly browser: string,
    readonly commit: string,
    readonly branch: string,
    readonly dirty: boolean,
    readonly environments: readonly EnvironmentOutcome[],
    readonly viewports: readonly { name: string; width: number; height: number }[],
    readonly steps: readonly { id: string; title: string; path: string; verifies: string[] }[],
    readonly results: readonly StepResult[],
    readonly contactSheets: Readonly<Record<string, string>>,
    readonly counts: { pass: number; fail: number; total: number },
  ) {
    super(id);
  }

  static fromRunJson(featureKey: string, raw: Record<string, any>): EvidenceRun {
    return new EvidenceRun(
      featureKey,
      String(raw.status ?? 'unknown'),
      String(raw.started_at ?? ''),
      String(raw.finished_at ?? ''),
      String(raw.browser ?? ''),
      String(raw.commit ?? ''),
      String(raw.branch ?? ''),
      Boolean(raw.dirty),
      (raw.environments ?? []).map((e: Record<string, any>) => ({
        name: String(e.name ?? ''),
        url: String(e.url ?? ''),
        required: Boolean(e.required),
        writes: Boolean(e.writes),
        recipe: String(e.recipe ?? ''),
        login: String(e.login ?? ''),
        message: String(e.message ?? ''),
        warmup: e.warmup
          ? {
              ok: Boolean(e.warmup.ok),
              attempts: Number(e.warmup.attempts ?? 0),
              durationMs: Number(e.warmup.duration_ms ?? 0),
              status: Number(e.warmup.status ?? 0),
              message: String(e.warmup.message ?? ''),
            }
          : null,
      })),
      (raw.viewports ?? []).map((v: Record<string, any>) => ({
        name: String(v.name ?? ''),
        width: Number(v.width ?? 0),
        height: Number(v.height ?? 0),
      })),
      (raw.steps ?? []).map((s: Record<string, any>) => ({
        id: String(s.id ?? ''),
        title: String(s.title ?? ''),
        path: String(s.path ?? ''),
        verifies: (s.verifies ?? []).map(String),
      })),
      (raw.results ?? []).map((r: Record<string, any>) => ({
        environment: String(r.env ?? ''),
        viewport: String(r.viewport ?? ''),
        step: String(r.step ?? ''),
        verdict: String(r.verdict ?? ''),
        durationMs: Number(r.duration_ms ?? 0),
        url: String(r.url ?? ''),
        screenshot: r.screenshot ? String(r.screenshot) : null,
        messages: (r.messages ?? []).filter(Boolean).map(String),
      })),
      raw.contact_sheets ?? {},
      {
        pass: Number(raw.counts?.pass ?? 0),
        fail: Number(raw.counts?.fail ?? 0),
        total: Number(raw.counts?.total ?? 0),
      },
    );
  }

  get passed(): boolean {
    return this.counts.fail === 0 && this.counts.total > 0;
  }

  get failures(): StepResult[] {
    return this.results.filter((r) => r.verdict !== 'pass');
  }

  /** A run taken against a dirty working tree proves less than it appears to. */
  get provenanceIsClean(): boolean {
    return Boolean(this.commit) && !this.dirty;
  }
}
