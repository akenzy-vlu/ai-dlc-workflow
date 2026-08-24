import { Module, forwardRef } from '@nestjs/common';

import { ToolingProbe } from '../../shared/infrastructure/tooling.probe';
import { ConstructionModule } from '../construction/construction.module';
import { GovernanceModule } from '../governance/governance.module';
import { PlanningModule } from '../planning/planning.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { BoardQuery } from './application/board.query';
import { FeatureDetailQuery } from './application/feature-detail.query';
import { FeatureSnapshotAssembler } from './application/feature-snapshot.assembler';
import { GateVerdictCache } from './application/gate-verdict.cache';
import { InboxQuery } from './application/inbox.query';
import { PortfolioOverviewQuery } from './application/portfolio-overview.query';
import { ReadyQueueQuery } from './application/ready-queue.query';
import { SearchQuery } from './application/search.query';
import { FeatureController } from './interface/feature.controller';
import { InsightController } from './interface/insight.controller';

/**
 * The read side, and the only module that knows about more than one bounded context.
 *
 * That is deliberate and it is where the coupling is allowed to live: the portfolio
 * question — "where does every feature stand" — is inherently cross-context, and pushing
 * it down into planning or governance would make one of them depend on the other two.
 * Here it depends on all three, and nothing depends on it except the transport.
 */
@Module({
  imports: [
    PortfolioModule,
    PlanningModule,
    forwardRef(() => ConstructionModule),
    forwardRef(() => GovernanceModule),
  ],
  controllers: [InsightController, FeatureController],
  providers: [
    ToolingProbe,
    FeatureSnapshotAssembler,
    GateVerdictCache,
    PortfolioOverviewQuery,
    InboxQuery,
    ReadyQueueQuery,
    FeatureDetailQuery,
    SearchQuery,
    BoardQuery,
  ],
  exports: [FeatureSnapshotAssembler, GateVerdictCache],
})
export class InsightModule {}
