import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { Acting, ActingIdentity } from '../../../shared/identity/acting-identity';
import { AgentLauncherService } from '../application/agent-launcher.service';
import { LaunchReadyTickets } from '../application/launch-ready.use-case';

class LaunchAgentDto {
  @IsString() @MinLength(1) agentId!: string;
  /** Ignored behind an authenticating proxy; see ApproveGateDto for why it is optional. */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) launchedBy?: string;
  @IsOptional() @IsString() @MaxLength(4000) extraInstructions?: string;
  @IsOptional() @IsInt() @Min(1) @Max(180) timeoutMinutes?: number;
  /** Must be true. See LaunchAgentInput for why the console will not infer it. */
  @IsBoolean() acknowledged!: boolean;
}

/** Same shape as a single launch, minus the ticket: this one picks the tickets itself. */
class LaunchReadyDto {
  @IsString() @MinLength(1) agentId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) launchedBy?: string;
  @IsOptional() @IsString() @MaxLength(4000) extraInstructions?: string;
  @IsOptional() @IsInt() @Min(1) @Max(180) timeoutMinutes?: number;
  @IsBoolean() acknowledged!: boolean;
}

class ReplyDto {
  @IsString() @MinLength(1) @MaxLength(4000) message!: string;
  /** Ignored behind an authenticating proxy; see LaunchAgentDto for why it is optional. */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) repliedBy?: string;
  @IsOptional() @IsInt() @Min(1) @Max(180) timeoutMinutes?: number;
  /** Same acknowledgement a launch requires — a reply spawns a CLI in a real checkout too. */
  @IsBoolean() acknowledged!: boolean;
}

@Controller('api')
export class AgentsController {
  constructor(
    private readonly launcher: AgentLauncherService,
    private readonly launchReadyTickets: LaunchReadyTickets,
  ) {}

  @Get('agents')
  async agents() {
    return this.launcher.listAgents();
  }

  @Get('agent-runs')
  async runs(
    @Query('repositoryId') repositoryId?: string,
    @Query('slug') slug?: string,
    @Query('ticketId') ticketId?: string,
    @Query('active') active?: string,
  ) {
    return this.launcher.listRuns({
      repositoryId,
      slug,
      ticketId,
      active: active === undefined ? undefined : active === 'true',
    });
  }

  @Get('agent-runs/:id')
  async run(@Param('id') id: string) {
    return this.launcher.getRun(id);
  }

  @Post('agent-runs/:id/cancel')
  async cancel(@Param('id') id: string) {
    return this.launcher.cancel(id);
  }

  /**
   * Continues the conversation the run at `:id` already had.
   *
   * Lives on the run, not the ticket: a reply continues one specific session, and the run
   * is what holds it. `thread`, below, is the ticket-level view that ties runs together.
   */
  @Post('agent-runs/:id/reply')
  async reply(@Param('id') id: string, @Body() dto: ReplyDto, @Acting('repliedBy') acting: ActingIdentity) {
    return this.launcher.reply({ runId: id, ...dto, repliedBy: acting.name });
  }

  @Get('features/:repositoryId/:slug/tickets/:ticketId/thread')
  async thread(
    @Param('repositoryId') repositoryId: string,
    @Param('slug') slug: string,
    @Param('ticketId') ticketId: string,
  ) {
    return this.launcher.thread(repositoryId, slug, ticketId);
  }

  @Get('features/:repositoryId/:slug/tickets/:ticketId/briefing')
  async briefing(
    @Param('repositoryId') repositoryId: string,
    @Param('slug') slug: string,
    @Param('ticketId') ticketId: string,
  ) {
    return { briefing: await this.launcher.previewBriefing(repositoryId, slug, ticketId) };
  }

  @Post('features/:repositoryId/:slug/tickets/:ticketId/launch-agent')
  async launch(
    @Param('repositoryId') repositoryId: string,
    @Param('slug') slug: string,
    @Param('ticketId') ticketId: string,
    @Body() dto: LaunchAgentDto,
    @Acting('launchedBy') acting: ActingIdentity,
  ) {
    // A run is attributed to a person and an agent both; the person half is the one that
    // has to be true, because it is what the ticket's audit entry will carry.
    return this.launcher.launch({ repositoryId, slug, ticketId, ...dto, launchedBy: acting.name });
  }

  /**
   * Hands every pickable ticket in the feature to an agent at once.
   *
   * Separate from the single launch rather than a flag on it: this one decides *which*
   * tickets go, and that decision — dependencies met, not already running, no write
   * conflict with another launched ticket — is the whole feature.
   */
  @Post('features/:repositoryId/:slug/launch-ready')
  async launchReady(
    @Param('repositoryId') repositoryId: string,
    @Param('slug') slug: string,
    @Body() dto: LaunchReadyDto,
    @Acting('launchedBy') acting: ActingIdentity,
  ) {
    return this.launchReadyTickets.execute({ repositoryId, slug, ...dto, launchedBy: acting.name });
  }
}
