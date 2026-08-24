import { Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig, CONTROLLER_SCRIPTS } from '../../../config/aidlc.config';
import { Gate } from '../../../shared/kernel';
import { ProcessRunner } from '../../../shared/infrastructure/process/process-runner';
import { GateFinding, GateVerdict } from '../domain/model/gate-verdict';
import { GateCommandOutcome, GateControllerPort } from '../domain/ports/gate-controller.port';

@Injectable()
export class CliGateController implements GateControllerPort {
  private readonly logger = new Logger(CliGateController.name);

  constructor(
    @Inject(AIDLC_CONFIG) private readonly config: AidlcConfig,
    private readonly runner: ProcessRunner,
  ) {}

  async init(featureDirectory: string, slug: string, profile: string | null): Promise<GateCommandOutcome> {
    const args = [this.script(), '-d', featureDirectory, 'init', slug];
    if (profile) args.push('--profile', profile);
    return this.execute(args);
  }

  async check(featureDirectory: string, gate: Gate): Promise<GateVerdict> {
    if (gate.isNone) return GateVerdict.unavailable(gate, 'no gate to check');

    const result = await this.runner
      .run(this.config.pythonBin, [this.script(), '-d', featureDirectory, 'check', gate.value], { timeoutMs: 60_000 })
      .catch((error: Error) => {
        this.logger.warn(`check ${gate.value} failed for ${featureDirectory}: ${error.message}`);
        return null;
      });

    if (result === null) return GateVerdict.unavailable(gate, 'controller did not respond');
    // Exit 2 is a usage error and 1 is a failing gate; only the former means the verdict
    // itself is unusable. A missing state file also lands here, on stderr.
    if (result.code === 2 || (result.code !== 0 && !result.stdout.trim())) {
      return GateVerdict.unavailable(gate, result.stderr.trim() || 'controller refused the request');
    }

    return GateVerdict.create({
      gate,
      passed: result.code === 0,
      findings: this.parseFindings(result.stdout),
    });
  }

  async pass(featureDirectory: string, gate: Gate, by: string): Promise<GateCommandOutcome> {
    return this.execute([this.script(), '-d', featureDirectory, 'pass', gate.value, '--by', by]);
  }

  async reopen(featureDirectory: string, gate: Gate, by: string, reason: string): Promise<GateCommandOutcome> {
    return this.execute([
      this.script(), '-d', featureDirectory, 'reopen', gate.value, '--by', by, '--reason', reason,
    ]);
  }

  async snapshot(featureDirectory: string, repoRoot: string, label: string): Promise<unknown | null> {
    const result = await this.runner
      .run(
        this.config.pythonBin,
        [this.script(), '-d', featureDirectory, 'snapshot', '--repo', repoRoot, '--label', label],
        { timeoutMs: 60_000 },
      )
      .catch(() => null);
    if (!result || result.code !== 0) return null;
    try {
      return JSON.parse(result.stdout);
    } catch {
      return null;
    }
  }

  /**
   * Turns `  ✗ message` / `  · message` back into structured findings.
   *
   * Parsing another program's stdout is a contract, so it is asserted rather than
   * assumed: a line that matches neither marker is kept as a `fail` rather than dropped,
   * because silently losing a blocker is the one failure mode that matters here.
   */
  private parseFindings(stdout: string): GateFinding[] {
    const findings: GateFinding[] = [];
    for (const line of stdout.split('\n')) {
      const match = /^\s{2}([·✗])\s+(.*)$/.exec(line);
      if (match) {
        findings.push({ level: match[1] === '·' ? 'ok' : 'fail', message: match[2].trim() });
        continue;
      }
      const trimmed = line.trim();
      if (trimmed.startsWith('refused:')) {
        findings.push({ level: 'fail', message: trimmed.replace(/^refused:\s*/, '') });
      }
    }
    return findings;
  }

  private script(): string {
    return path.join(this.config.corePath, CONTROLLER_SCRIPTS.aidlc);
  }

  private async execute(args: string[]): Promise<GateCommandOutcome> {
    const result = await this.runner.run(this.config.pythonBin, args, { timeoutMs: 60_000 });
    return {
      accepted: result.code === 0,
      output: [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n'),
      command: result.command,
      exitCode: result.code,
    };
  }
}
