import { Module, forwardRef } from '@nestjs/common';

import { InsightModule } from '../insight/insight.module';
import { PlanningModule } from '../planning/planning.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { AuditTrailQuery } from './application/audit-trail.query';
import { CreateFeatureUseCase } from './application/create-feature.use-case';
import { GateOperations } from './application/gate-operations.use-case';
import { GATE_CONTROLLER } from './domain/ports/gate-controller.port';
import { GATE_STATE_READER } from './domain/ports/gate-state-reader.port';
import { CliGateController } from './infrastructure/cli-gate-controller.adapter';
import { FilesystemGateStateReader } from './infrastructure/filesystem-gate-state.reader';
import { FeatureLifecycleController } from './interface/feature-lifecycle.controller';

@Module({
  imports: [PortfolioModule, PlanningModule, forwardRef(() => InsightModule)],
  controllers: [FeatureLifecycleController],
  providers: [
    GateOperations,
    AuditTrailQuery,
    CreateFeatureUseCase,
    { provide: GATE_STATE_READER, useClass: FilesystemGateStateReader },
    { provide: GATE_CONTROLLER, useClass: CliGateController },
  ],
  exports: [GATE_STATE_READER, GATE_CONTROLLER, GateOperations, AuditTrailQuery, CreateFeatureUseCase],
})
export class GovernanceModule {}
