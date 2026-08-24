import { Module, forwardRef } from '@nestjs/common';

import { InsightModule } from '../insight/insight.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { TicketOperations } from './application/ticket-operations.use-case';
import { PLAN_MUTATOR } from './domain/ports/plan-mutator.port';
import { CONSTRUCTION_PLAN_READER } from './domain/ports/plan-reader.port';
import { CliPlanMutator } from './infrastructure/cli-plan.mutator';
import { FilesystemConstructionPlanReader } from './infrastructure/filesystem-construction-plan.reader';

@Module({
  imports: [PortfolioModule, forwardRef(() => InsightModule)],
  providers: [
    TicketOperations,
    { provide: CONSTRUCTION_PLAN_READER, useClass: FilesystemConstructionPlanReader },
    { provide: PLAN_MUTATOR, useClass: CliPlanMutator },
  ],
  exports: [CONSTRUCTION_PLAN_READER, PLAN_MUTATOR, TicketOperations],
})
export class ConstructionModule {}
