import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { FeatureRef } from '../../../shared/kernel';
import { ProcessRunner } from '../../../shared/infrastructure/process/process-runner';
import { VerificationPlan } from '../domain/model/verification-plan';
import { VerificationRung } from '../domain/model/verification-rung';
import {
  VerificationControllerPort,
  VerificationOutcome,
  VerificationRunRequest,
} from '../domain/ports/verification.port';

const VERIFY_SCRIPT = 'scripts/verify.py';
const EVIDENCE_CHECK_SCRIPT = 'scripts/evidence_check.py';

@Injectable()
export class CliVerificationController implements VerificationControllerPort {
  private readonly logger = new Logger(CliVerificationController.name);

  constructor(
    @Inject(AIDLC_CONFIG) private readonly config: AidlcConfig,
    private readonly runner: ProcessRunner,
  ) {}

  isInstalled(): boolean {
    return this.config.verifyPath !== null && fs.existsSync(path.join(this.config.verifyPath, VERIFY_SCRIPT));
  }

  async resolve(ref: FeatureRef, featureDirectory: string): Promise<VerificationPlan> {
    if (!this.isInstalled()) {
      return VerificationPlan.unavailable(ref, 'ai-dlc-verify is not installed on this machine');
    }

    const result = await this.runner
      .run(this.config.pythonBin, [this.script(VERIFY_SCRIPT), featureDirectory, '--json'], {
        timeoutMs: 30_000,
      })
      .catch((error: Error) => {
        this.logger.warn(`verify --json failed for ${featureDirectory}: ${error.message}`);
        return null;
      });

    if (!result) return VerificationPlan.unavailable(ref, 'verify.py did not respond');

    // Exit 1 with a body is a config error, not a crash: `--json` prints the resolution
    // either way, and the rung inside it is the answer.
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(result.stdout);
    } catch {
      return VerificationPlan.unavailable(ref, result.stderr.trim() || 'verify.py returned no resolution');
    }

    return VerificationPlan.create({
      ref,
      rung: VerificationRung.create(payload.rung),
      reason: String(payload.reason ?? ''),
      errors: (payload.errors ?? []).map(String),
      warnings: (payload.warnings ?? []).map(String),
      environments: (payload.environments ?? []).map((e: Record<string, any>) => ({
        name: String(e.name ?? ''),
        url: String(e.url ?? ''),
        enabled: e.enabled !== false,
        required: Boolean(e.required),
        writes: Boolean(e.writes),
        recipe: String(e.recipe ?? 'none'),
        missing: (e.missing ?? []).map(String),
        ready: Boolean(e.ready),
      })),
      viewports: (payload.viewports ?? []).map((v: Record<string, any>) => ({
        name: String(v.name ?? ''),
        width: Number(v.width ?? 0),
        height: Number(v.height ?? 0),
        isMobile: Boolean(v.isMobile),
        deviceScaleFactor: Number(v.deviceScaleFactor ?? 1),
      })),
      stepIds: (payload.steps ?? []).map(String),
    });
  }

  async run(request: VerificationRunRequest): Promise<VerificationOutcome> {
    const args = [this.script(VERIFY_SCRIPT), request.featureDirectory];
    for (const env of request.environments ?? []) args.push('--env', env);
    for (const viewport of request.viewports ?? []) args.push('--viewport', viewport);
    if (request.write) args.push('--write');

    // A browser walk across several environments and viewports is minutes, not seconds.
    return this.execute(args, 15 * 60_000);
  }

  async checkEvidence(featureDirectory: string): Promise<VerificationOutcome> {
    if (!this.isInstalled()) {
      return { accepted: false, output: 'ai-dlc-verify is not installed', command: '', exitCode: 127 };
    }
    return this.execute([this.script(EVIDENCE_CHECK_SCRIPT), featureDirectory], 60_000);
  }

  private script(relative: string): string {
    return path.join(this.config.verifyPath ?? '', relative);
  }

  private async execute(args: string[], timeoutMs: number): Promise<VerificationOutcome> {
    const env: NodeJS.ProcessEnv = {};
    // The runner is the only file in ai-dlc-verify with a dependency (Playwright), so it
    // usually lives in its own venv. verify.py honours this variable when it spawns it.
    // Read at call time, not at boot: the setup page can point it at a freshly created
    // venv, and a run started right afterwards must use it without a restart.
    if (process.env.AIDLC_VERIFY_PYTHON) env.AIDLC_VERIFY_PYTHON = process.env.AIDLC_VERIFY_PYTHON;

    const result = await this.runner.run(this.config.pythonBin, args, { timeoutMs, env });
    return {
      accepted: result.code === 0,
      output: [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n'),
      command: result.command,
      exitCode: result.code,
    };
  }
}
