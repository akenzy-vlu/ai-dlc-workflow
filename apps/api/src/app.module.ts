import { Module } from '@nestjs/common';

import { AgentsModule } from './contexts/agents/agents.module';
import { ConstructionModule } from './contexts/construction/construction.module';
import { GovernanceModule } from './contexts/governance/governance.module';
import { InsightModule } from './contexts/insight/insight.module';
import { PlanningModule } from './contexts/planning/planning.module';
import { PortfolioModule } from './contexts/portfolio/portfolio.module';
import { SkillsModule } from './contexts/skills/skills.module';
import { VerificationModule } from './contexts/verification/verification.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    SharedModule,
    PortfolioModule,
    PlanningModule,
    ConstructionModule,
    GovernanceModule,
    InsightModule,
    VerificationModule,
    AgentsModule,
    SkillsModule,
    RealtimeModule,
  ],
})
export class AppModule {}
