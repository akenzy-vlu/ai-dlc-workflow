import { Inject, Injectable } from '@nestjs/common';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig, CONTROLLER_SCRIPTS } from '../../../config/aidlc.config';
import { TicketAction } from '../../../shared/kernel';
import { ProcessRunner } from '../../../shared/infrastructure/process/process-runner';
import { ControllerOutcome, PlanMutatorPort } from '../domain/ports/plan-mutator.port';

@Injectable()
export class CliPlanMutator implements PlanMutatorPort {
  constructor(
    @Inject(AIDLC_CONFIG) private readonly config: AidlcConfig,
    private readonly runner: ProcessRunner,
  ) {}

  async transitionTicket(params: {
    featureDirectory: string;
    ticketId: string;
    action: TicketAction;
    by: string;
    reason?: string;
    noReview?: boolean;
  }): Promise<ControllerOutcome> {
    const args = [
      path.join(this.config.corePath, CONTROLLER_SCRIPTS.aidlc),
      '-d',
      params.featureDirectory,
      params.action,
      params.ticketId,
      '--by',
      params.by,
    ];
    // `reject` requires a reason; `done --no-review` records the bypass rather than
    // hiding it. Both are the controller's rules, reproduced here only as argument
    // assembly — the refusal, if any, still comes from the controller.
    if (params.reason) args.push('--reason', params.reason);
    if (params.noReview && params.action === 'done') args.push('--no-review');

    return this.execute(args);
  }

  async regenerateDerivedArtifacts(featureDirectory: string): Promise<ControllerOutcome> {
    return this.execute([
      path.join(this.config.corePath, CONTROLLER_SCRIPTS.uowGraph),
      featureDirectory,
      '--write',
    ]);
  }

  async validate(featureDirectory: string): Promise<ControllerOutcome> {
    return this.execute([path.join(this.config.corePath, CONTROLLER_SCRIPTS.uowGraph), featureDirectory]);
  }

  async lintTouches(featureDirectory: string, repoRoot: string): Promise<ControllerOutcome> {
    return this.execute([
      path.join(this.config.corePath, CONTROLLER_SCRIPTS.aidlc),
      '-d',
      featureDirectory,
      'lint-touches',
      '--repo',
      repoRoot,
    ]);
  }

  private async execute(args: string[]): Promise<ControllerOutcome> {
    const result = await this.runner.run(this.config.pythonBin, args, { timeoutMs: 60_000 });
    return {
      accepted: result.code === 0,
      output: [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n'),
      command: result.command,
      exitCode: result.code,
    };
  }
}
