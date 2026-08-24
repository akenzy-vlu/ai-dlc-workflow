import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'node:path';

import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import { RunnerSetupService } from './runner-setup.service';
import { FeatureSnapshotAssembler } from '../../insight/application/feature-snapshot.assembler';
import { GateVerdictCache } from '../../insight/application/gate-verdict.cache';
import { EvidenceRun } from '../domain/model/evidence-run';
import { VerificationPlan } from '../domain/model/verification-plan';
import {
  EVIDENCE_READER,
  EvidenceReaderPort,
  VERIFICATION_CONTROLLER,
  VerificationControllerPort,
  VerificationOutcome,
} from '../domain/ports/verification.port';

export interface VerificationView {
  installed: boolean;
  /**
   * Whether this *machine* can drive a browser, as opposed to whether the *project* is
   * configured to. A capable rung with no Playwright is not a misconfigured project — it
   * is a laptop that has not been set up, and the two need different fixes.
   */
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
  /** Unready, but not gating this feature — its spec does not walk them. */
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
    environments: EvidenceRun['environments'];
    viewports: EvidenceRun['viewports'];
    steps: EvidenceRun['steps'];
    results: EvidenceRun['results'];
    contactSheets: Record<string, string>;
  } | null;
}

@Injectable()
export class VerificationService {
  constructor(
    @Inject(VERIFICATION_CONTROLLER) private readonly controller: VerificationControllerPort,
    @Inject(EVIDENCE_READER) private readonly evidence: EvidenceReaderPort,
    private readonly repositories: RepositoryMaintenance,
    private readonly assembler: FeatureSnapshotAssembler,
    private readonly verdicts: GateVerdictCache,
    private readonly runnerSetup: RunnerSetupService,
  ) {}

  async describe(repositoryId: string, slug: string): Promise<VerificationView> {
    const { ref, featureDirectory } = await this.resolve(repositoryId, slug);
    const [plan, run, runner] = await Promise.all([
      this.controller.resolve(ref, featureDirectory),
      this.evidence.read(ref.key, featureDirectory),
      this.runnerSetup.status(),
    ]);
    return this.present(plan, run, runner);
  }

  /**
   * Runs the browser walk.
   *
   * `write` is refused off the `capable` rung, and that refusal is the important one:
   * writing the evidence block into `uow.md` on any other rung produces checkboxes the
   * project can never tick, and `check_g4` counts unticked boxes. The only way out of
   * that state is hand-editing `.aidlc-state.yaml` — the single move that turns the whole
   * apparatus into theatre.
   */
  async run(
    repositoryId: string,
    slug: string,
    options: { environments?: string[]; viewports?: string[]; write?: boolean },
  ): Promise<VerificationOutcome> {
    const { ref, featureDirectory } = await this.resolve(repositoryId, slug);
    const plan = await this.controller.resolve(ref, featureDirectory);

    if (plan.rung.isConfigError) {
      throw new BadRequestException(
        `.ai/aidlc.yaml has a verification config error: ${plan.errors.join('; ')}`,
      );
    }
    if (options.write && !plan.rung.canRun) {
      throw new BadRequestException(
        `refusing --write on the "${plan.rung.value}" rung — it would write checkboxes into uow.md that this project cannot tick, and G4 counts unticked boxes`,
      );
    }
    if (!plan.rung.canRun) {
      throw new BadRequestException(`nothing to run: ${plan.reason || plan.rung.value}`);
    }

    const runner = await this.runnerSetup.status();
    if (!runner.ready) {
      // Caught here rather than left to verify.py so the message names the fix — the
      // controller's own refusal is accurate but tells the user to run pip by hand.
      throw new BadRequestException(
        `the browser runner is not ready on this machine: ${runner.blockers.join('; ')}. Set it up under Configure → Setup.`,
      );
    }

    const outcome = await this.controller.run({ featureDirectory, ...options });
    // A --write run appends a checkbox block to uow.md, which is a G4 precondition.
    this.assembler.invalidate(repositoryId, slug);
    this.verdicts.invalidate(ref.key);
    return outcome;
  }

  async checkEvidence(repositoryId: string, slug: string): Promise<VerificationOutcome> {
    const { featureDirectory } = await this.resolve(repositoryId, slug);
    return this.controller.checkEvidence(featureDirectory);
  }

  async artifactPath(repositoryId: string, slug: string, relativePath: string): Promise<string> {
    const { featureDirectory } = await this.resolve(repositoryId, slug);
    const resolved = this.evidence.resolveArtifact(featureDirectory, relativePath);
    if (!resolved) throw new BadRequestException('artifact path escapes the evidence directory');
    return resolved;
  }

  private present(
    plan: VerificationPlan,
    run: EvidenceRun | null,
    runner: { ready: boolean; interpreter: string; blockers: string[] },
  ): VerificationView {
    return {
      installed: plan.toolAvailable,
      runner: { ready: runner.ready, interpreter: runner.interpreter, blockers: [...runner.blockers] },
      rung: plan.rung.value,
      reason: plan.reason,
      canRun: plan.rung.canRun,
      errors: [...plan.errors],
      warnings: [...plan.warnings],
      environments: plan.environments.map((e) => ({ ...e, missing: [...e.missing] })),
      viewports: plan.viewports.map((v) => ({ name: v.name, width: v.width, height: v.height })),
      stepIds: [...plan.stepIds],
      blockedRequired: plan.blockedRequiredEnvironments.map((e) => e.name),
      unreadyButNotGating: plan.unreadyButNotGating.map((e) => e.name),
      writingEnvironments: plan.writingEnvironments.map((e) => e.name),
      run: run
        ? {
            status: run.status,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            browser: run.browser,
            commit: run.commit,
            branch: run.branch,
            dirty: run.dirty,
            passed: run.passed,
            counts: run.counts,
            environments: run.environments,
            viewports: run.viewports,
            steps: run.steps,
            results: run.results,
            contactSheets: { ...run.contactSheets },
          }
        : null,
    };
  }

  private async resolve(repositoryId: string, slug: string) {
    const repository = await this.repositories.require(repositoryId);
    const snapshot = await this.assembler.assembleById(repositoryId, slug);
    if (!snapshot) throw new NotFoundException(`feature not found: ${repositoryId}/${slug}`);
    return {
      ref: snapshot.gateState.ref,
      featureDirectory: path.join(repository.featuresDirectory, slug),
    };
  }
}
