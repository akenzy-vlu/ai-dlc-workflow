import { Module } from '@nestjs/common';

import { AgentsModule } from '../contexts/agents/agents.module';
import { GovernanceModule } from '../contexts/governance/governance.module';
import { InsightModule } from '../contexts/insight/insight.module';
import { PortfolioModule } from '../contexts/portfolio/portfolio.module';
import { VerificationModule } from '../contexts/verification/verification.module';
import { AgentEventBridge } from './agent-event.bridge';
import { MaintenanceController } from './maintenance.controller';
import { PlanEventsGateway } from './plan-events.gateway';
import { PlanWatcherService } from './plan-watcher.service';

@Module({
  imports: [PortfolioModule, InsightModule, GovernanceModule, AgentsModule, VerificationModule],
  controllers: [MaintenanceController],
  providers: [PlanEventsGateway, PlanWatcherService, AgentEventBridge],
  exports: [PlanEventsGateway, PlanWatcherService],
})
export class RealtimeModule {}
