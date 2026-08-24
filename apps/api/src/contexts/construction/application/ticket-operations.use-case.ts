import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'node:path';

import { TICKET_ACTIONS, TicketAction } from '../../../shared/kernel';
import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import { FeatureSnapshotAssembler } from '../../insight/application/feature-snapshot.assembler';
import { GateVerdictCache } from '../../insight/application/gate-verdict.cache';
import { ControllerOutcome, PLAN_MUTATOR, PlanMutatorPort } from '../domain/ports/plan-mutator.port';

export interface TicketTransitionInput {
  repositoryId: string;
  slug: string;
  ticketId: string;
  action: string;
  by: string;
  reason?: string;
  noReview?: boolean;
}

@Injectable()
export class TicketOperations {
  constructor(
    @Inject(PLAN_MUTATOR) private readonly mutator: PlanMutatorPort,
    private readonly repositories: RepositoryMaintenance,
    private readonly assembler: FeatureSnapshotAssembler,
    private readonly verdicts: GateVerdictCache,
  ) {}

  async transition(input: TicketTransitionInput): Promise<ControllerOutcome> {
    if (!(input.action in TICKET_ACTIONS)) {
      throw new BadRequestException(
        `unknown action "${input.action}" — expected one of ${Object.keys(TICKET_ACTIONS).join(', ')}`,
      );
    }
    if (!input.by.trim()) throw new BadRequestException('`by` is required — the audit trail records who acted');
    if (input.action === 'reject' && !input.reason?.trim()) {
      throw new BadRequestException('`reason` is required when rejecting');
    }

    const featureDirectory = await this.resolve(input.repositoryId, input.slug);
    const outcome = await this.mutator.transitionTicket({
      featureDirectory,
      ticketId: input.ticketId,
      action: input.action as TicketAction,
      by: input.by.trim(),
      reason: input.reason?.trim(),
      noReview: input.noReview,
    });

    this.invalidate(input.repositoryId, input.slug);
    return outcome;
  }

  /** `uow_graph.py --write`. Never hand-edit the three files this regenerates. */
  async regenerate(repositoryId: string, slug: string): Promise<ControllerOutcome> {
    const featureDirectory = await this.resolve(repositoryId, slug);
    const outcome = await this.mutator.regenerateDerivedArtifacts(featureDirectory);
    this.invalidate(repositoryId, slug);
    return outcome;
  }

  async validate(repositoryId: string, slug: string): Promise<ControllerOutcome> {
    return this.mutator.validate(await this.resolve(repositoryId, slug));
  }

  async lintTouches(repositoryId: string, slug: string): Promise<ControllerOutcome> {
    const repository = await this.repositories.require(repositoryId);
    const featureDirectory = await this.resolve(repositoryId, slug);
    return this.mutator.lintTouches(featureDirectory, repository.absolutePath);
  }

  private async resolve(repositoryId: string, slug: string): Promise<string> {
    const repository = await this.repositories.require(repositoryId);
    const snapshot = await this.assembler.assembleById(repositoryId, slug);
    if (!snapshot) throw new NotFoundException(`feature not found: ${repositoryId}/${slug}`);
    return path.join(repository.featuresDirectory, slug);
  }

  private invalidate(repositoryId: string, slug: string): void {
    this.assembler.invalidate(repositoryId, slug);
    this.verdicts.invalidate(`${repositoryId}/${slug}`);
  }
}
