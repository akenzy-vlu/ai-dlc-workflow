import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import * as path from 'node:path';

import { FEATURE_PLAN_READER, FeaturePlanReaderPort } from '../../planning/domain/ports/feature-plan.port';
import { Inject } from '@nestjs/common';
import { GateOperations } from '../../governance/application/gate-operations.use-case';
import { TicketOperations } from '../../construction/application/ticket-operations.use-case';
import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import { FeatureDetailQuery } from '../application/feature-detail.query';
import { Acting, ActingIdentity } from '../../../shared/identity/acting-identity';
import { ReopenGateDto, TransitionTicketDto } from './dto/feature.dto';

/**
 * One feature, read and acted on.
 *
 * Every POST here is a thin wrapper over a controller subprocess. The response always
 * carries the command that ran and its exit code alongside the output, so a refusal is
 * reproducible in a terminal rather than being something "the UI said".
 */
@Controller('api/features/:repositoryId/:slug')
export class FeatureController {
  constructor(
    private readonly detail: FeatureDetailQuery,
    private readonly gates: GateOperations,
    private readonly tickets: TicketOperations,
    private readonly repositories: RepositoryMaintenance,
    @Inject(FEATURE_PLAN_READER) private readonly planReader: FeaturePlanReaderPort,
  ) {}

  @Get()
  async get(@Param('repositoryId') repositoryId: string, @Param('slug') slug: string) {
    return this.detail.execute({ repositoryId, slug });
  }

  @Get('document')
  async document(
    @Param('repositoryId') repositoryId: string,
    @Param('slug') slug: string,
    @Query('name') name: string,
  ) {
    // `name` is required. Without this the missing param reaches path.join() as undefined
    // and surfaces as a 500 — an internal error for what is a malformed request.
    if (!name?.trim()) throw new BadRequestException('name is required, e.g. ?name=01-intent.md');

    const repository = await this.repositories.require(repositoryId);
    const directory = path.join(repository.featuresDirectory, slug);
    const content = await this.planReader.readDocument(directory, name);
    if (content === null) throw new NotFoundException(`no such document: ${name}`);
    return { name, content };
  }

  @Post('gates/:gate/check')
  async checkGate(
    @Param('repositoryId') repositoryId: string,
    @Param('slug') slug: string,
    @Param('gate') gate: string,
  ) {
    const verdict = await this.gates.check({ repositoryId, slug, gate });
    return {
      gate: verdict.gate.value,
      passed: verdict.passed,
      error: verdict.error,
      checkedAt: verdict.checkedAt.toISOString(),
      findings: verdict.findings,
    };
  }

  @Post('gates/:gate/pass')
  async passGate(
    @Param('repositoryId') repositoryId: string,
    @Param('slug') slug: string,
    @Param('gate') gate: string,
    @Acting() acting: ActingIdentity,
  ) {
    // `acting.name`, never `dto.by`: behind an authenticating proxy the body is not
    // trusted to say who approved a gate.
    return this.gates.pass({ repositoryId, slug, gate }, acting.name);
  }

  @Post('gates/:gate/reopen')
  async reopenGate(
    @Param('repositoryId') repositoryId: string,
    @Param('slug') slug: string,
    @Param('gate') gate: string,
    @Body() dto: ReopenGateDto,
    @Acting() acting: ActingIdentity,
  ) {
    return this.gates.reopen({ repositoryId, slug, gate }, acting.name, dto.reason);
  }

  @Post('tickets/:ticketId/transition')
  async transitionTicket(
    @Param('repositoryId') repositoryId: string,
    @Param('slug') slug: string,
    @Param('ticketId') ticketId: string,
    @Body() dto: TransitionTicketDto,
    @Acting() acting: ActingIdentity,
  ) {
    return this.tickets.transition({
      repositoryId,
      slug,
      ticketId,
      action: dto.action,
      by: acting.name,
      reason: dto.reason,
      noReview: dto.noReview,
    });
  }

  @Post('regenerate')
  async regenerate(@Param('repositoryId') repositoryId: string, @Param('slug') slug: string) {
    return this.tickets.regenerate(repositoryId, slug);
  }

  @Post('validate')
  async validate(@Param('repositoryId') repositoryId: string, @Param('slug') slug: string) {
    return this.tickets.validate(repositoryId, slug);
  }

  @Post('lint-touches')
  async lintTouches(@Param('repositoryId') repositoryId: string, @Param('slug') slug: string) {
    return this.tickets.lintTouches(repositoryId, slug);
  }
}
