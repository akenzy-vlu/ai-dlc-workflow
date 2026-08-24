import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig, CONTROLLER_SCRIPTS } from '../../config/aidlc.config';
import { ProcessRunner } from './process/process-runner';

export interface ToolingStatus {
  /** False when the controller is missing — the console is read-only until it is fixed. */
  available: boolean;
  corePath: string;
  pythonBin: string;
  uowGraphVersion: string | null;
  /**
   * The validation ruleset the installed uow_graph.py judges by. A repo pinning a
   * different one in `.ai/aidlc.yaml` is being re-judged under rules it was not written
   * against, which is exactly what the pin exists to surface.
   */
  ruleset: number | null;
  verifyAvailable: boolean;
  /**
   * True when the API runs in a container.
   *
   * It changes what advice is correct, not just what is true: an agent CLI installed on
   * the host is invisible in here, so telling someone to install one would send them to
   * do something that cannot help.
   */
  containerized: boolean;
  error: string | null;
}

/**
 * Asks the installed tooling what it is, once at boot.
 *
 * Hard-coding `RULESET = 4` here would be a second place to update, and it would go stale
 * silently: the console would keep reporting agreement with a controller that had moved on.
 */
@Injectable()
export class ToolingProbe {
  private readonly logger = new Logger(ToolingProbe.name);
  private cached: ToolingStatus | null = null;

  constructor(
    @Inject(AIDLC_CONFIG) private readonly config: AidlcConfig,
    private readonly runner: ProcessRunner,
  ) {}

  async status(force = false): Promise<ToolingStatus> {
    if (this.cached && !force) return this.cached;

    const base: ToolingStatus = {
      available: false,
      containerized: fs.existsSync('/.dockerenv'),
      corePath: this.config.corePath,
      pythonBin: this.config.pythonBin,
      uowGraphVersion: null,
      ruleset: null,
      verifyAvailable: this.config.verifyPath !== null,
      error: null,
    };

    const result = await this.runner
      .run(this.config.pythonBin, [path.join(this.config.corePath, CONTROLLER_SCRIPTS.uowGraph), '--version'], {
        timeoutMs: 10_000,
      })
      .catch((error: Error) => {
        this.logger.error(`cannot run the AI-DLC controller: ${error.message}`);
        return null;
      });

    if (!result || result.code !== 0) {
      this.cached = { ...base, error: result?.stderr.trim() || `cannot execute ${this.config.pythonBin}` };
      return this.cached;
    }

    // `uow_graph 0.4.0 (ruleset 4)`
    const line = result.stdout.trim();
    const version = /uow_graph\s+(\S+)/.exec(line)?.[1] ?? null;
    const ruleset = Number(/ruleset\s+(\d+)/.exec(line)?.[1] ?? NaN);

    this.cached = {
      ...base,
      available: true,
      uowGraphVersion: version,
      ruleset: Number.isFinite(ruleset) ? ruleset : null,
    };
    return this.cached;
  }
}
