import { Module } from '@nestjs/common';

import { FEATURE_PLAN_READER } from './domain/ports/feature-plan.port';
import { FEATURE_SCAFFOLD_WRITER } from './domain/ports/feature-scaffold.port';
import { FilesystemFeaturePlanReader } from './infrastructure/filesystem-feature-plan.reader';
import { FilesystemFeatureScaffoldWriter } from './infrastructure/filesystem-feature-scaffold.writer';

@Module({
  providers: [
    { provide: FEATURE_PLAN_READER, useClass: FilesystemFeaturePlanReader },
    { provide: FEATURE_SCAFFOLD_WRITER, useClass: FilesystemFeatureScaffoldWriter },
  ],
  exports: [FEATURE_PLAN_READER, FEATURE_SCAFFOLD_WRITER],
})
export class PlanningModule {}
