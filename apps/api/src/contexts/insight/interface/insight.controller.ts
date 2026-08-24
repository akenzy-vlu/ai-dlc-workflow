import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import type { ViewFilter } from '../domain/view-filter';

import { AuditTrailQuery } from '../../governance/application/audit-trail.query';
import { InboxQuery } from '../application/inbox.query';
import { PortfolioOverviewQuery } from '../application/portfolio-overview.query';
import { ReadyQueueQuery } from '../application/ready-queue.query';
import { SearchQuery } from '../application/search.query';
import { BoardQuery } from '../application/board.query';

/**
 * The read side. Every endpoint here is derived from the plan files and re-derivable by
 * deleting every cache the process holds — which is exactly what makes it safe to be
 * opinionated in: nothing on this controller can be wrong in a way a rescan will not fix.
 */
@Controller('api')
export class InsightController {
  constructor(
    private readonly portfolio: PortfolioOverviewQuery,
    private readonly inbox: InboxQuery,
    private readonly readyQueue: ReadyQueueQuery,
    private readonly audit: AuditTrailQuery,
    private readonly search: SearchQuery,
    private readonly board: BoardQuery,
  ) {}

  @Get('search')
  async find(@Query('q') term = '', @Query('limit') limit?: string) {
    return this.search.execute({ term, limit: limit ? Number(limit) : 40 });
  }

  /**
   * Filters arrive as a JSON array in the query string rather than as repeated params.
   * A filter is a triple — property, operator, values — and encoding that as flat params
   * produces exactly the ambiguity between "status is todo, layer is api" and "status is
   * todo or api" that the AND/OR rule exists to settle.
   */
  @Post('board')
  async boardView(@Body() body: { scope?: string; filters?: ViewFilter[]; includeLocked?: boolean }) {
    return this.board.execute(body ?? {});
  }

  @Get('portfolio')
  async overview() {
    return this.portfolio.execute();
  }

  @Get('inbox')
  async waitingOnAHuman(
    @Query('repositoryId') repositoryId?: string,
    @Query('severity') severity?: 'blocker' | 'attention' | 'hygiene',
  ) {
    return this.inbox.execute({ repositoryId, severity });
  }

  @Get('ready-queue')
  async pickableNow(
    @Query('repositoryId') repositoryId?: string,
    @Query('layer') layer?: string,
    @Query('type') type?: string,
    @Query('maxHours') maxHours?: string,
  ) {
    return this.readyQueue.execute({
      repositoryId,
      layer,
      type,
      maxHours: maxHours ? Number(maxHours) : undefined,
    });
  }

  @Get('audit')
  async approvalTrail(
    @Query('repositoryId') repositoryId?: string,
    @Query('slug') slug?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.execute({ repositoryId, slug, limit: limit ? Number(limit) : 200 });
  }
}
