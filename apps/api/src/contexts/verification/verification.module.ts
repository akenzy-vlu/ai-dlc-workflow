import { Module, forwardRef } from '@nestjs/common';

import { loadAidlcConfig } from '../../config/aidlc.config';

import { InsightModule } from '../insight/insight.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { EvidenceArchiveService } from './application/evidence-archive.service';
import { RunnerSetupService } from './application/runner-setup.service';
import { VerificationService } from './application/verification.service';
import { EVIDENCE_STORE } from './domain/ports/evidence-store.port';
import { EVIDENCE_READER, VERIFICATION_CONTROLLER } from './domain/ports/verification.port';
import { CasEvidenceStore } from './infrastructure/cas-evidence.store';
import { MinioEvidenceStore } from './infrastructure/minio-evidence.store';
import { CliVerificationController } from './infrastructure/cli-verification.controller';
import { FilesystemEvidenceReader } from './infrastructure/filesystem-evidence.reader';
import { EvidenceController } from './interface/evidence.controller';
import { RunnerController } from './interface/runner.controller';
import { VerificationController } from './interface/verification.controller';

@Module({
  imports: [PortfolioModule, forwardRef(() => InsightModule)],
  controllers: [VerificationController, RunnerController, EvidenceController],
  providers: [
    VerificationService,
    RunnerSetupService,
    EvidenceArchiveService,
    { provide: VERIFICATION_CONTROLLER, useClass: CliVerificationController },
    { provide: EVIDENCE_READER, useClass: FilesystemEvidenceReader },
    {
      provide: EVIDENCE_STORE,
      useClass: loadAidlcConfig().store === 'postgres' ? MinioEvidenceStore : CasEvidenceStore,
    },
  ],
  exports: [VerificationService, RunnerSetupService, EvidenceArchiveService, VERIFICATION_CONTROLLER],
})
export class VerificationModule {}
