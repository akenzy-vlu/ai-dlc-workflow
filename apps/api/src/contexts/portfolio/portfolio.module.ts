import { Module } from '@nestjs/common';

import { loadAidlcConfig } from '../../config/aidlc.config';

import { ToolingProbe } from '../../shared/infrastructure/tooling.probe';
import { BrowseDirectories } from './application/browse-directories.query';
import { NativeFolderPicker } from './application/native-folder-picker.service';
import { RegisterRepositoryUseCase } from './application/register-repository.use-case';
import { RepositoryMaintenance } from './application/repository-maintenance.use-case';
import { ProjectGroupingService } from './domain/services/project-grouping.service';
import { REPOSITORY_INSPECTOR } from './domain/ports/repository-inspector.port';
import { REPOSITORY_REGISTRY } from './domain/ports/repository-registry.port';
import { FilesystemRepositoryInspector } from './infrastructure/filesystem-repository-inspector';
import { JsonRepositoryRegistry } from './infrastructure/json-repository-registry';
import { PgRepositoryRegistry } from './infrastructure/pg-repository-registry';
import { PortfolioController } from './interface/portfolio.controller';

/**
 * Ports are bound to adapters here and nowhere else. Application and domain code names
 * only the symbols, which is what lets the whole context be exercised against an
 * in-memory registry without a filesystem.
 */
@Module({
  controllers: [PortfolioController],
  providers: [
    ToolingProbe,
    RegisterRepositoryUseCase,
    BrowseDirectories,
    NativeFolderPicker,
    RepositoryMaintenance,
    ProjectGroupingService,
    {
      provide: REPOSITORY_REGISTRY,
      useClass:
        loadAidlcConfig().store === 'postgres' ? PgRepositoryRegistry : JsonRepositoryRegistry,
    },
    { provide: REPOSITORY_INSPECTOR, useClass: FilesystemRepositoryInspector },
  ],
  exports: [RepositoryMaintenance, ProjectGroupingService, ToolingProbe],
})
export class PortfolioModule {}
