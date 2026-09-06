import { Module } from '@nestjs/common';

import { PortfolioModule } from '../portfolio/portfolio.module';
import { InstallSkill } from './application/install-skill.use-case';
import { SkillFiles } from './application/skill-files.use-case';
import { SkillInventory } from './application/skill-inventory.use-case';
import { SKILL_CATALOG } from './domain/ports/skill-catalog.port';
import { SKILL_INSTALLER } from './domain/ports/skill-installer.port';
import { FilesystemSkillCatalog } from './infrastructure/filesystem-skill-catalog';
import { FilesystemSkillInstaller } from './infrastructure/filesystem-skill-installer';
import { SkillsController } from './interface/skills.controller';

/**
 * Skill packaging: what this checkout ships, and where each package is installed.
 *
 * Depends on PortfolioModule only to resolve project-scoped install targets — a tracked
 * repository is the destination, never the source.
 */
@Module({
  imports: [PortfolioModule],
  controllers: [SkillsController],
  providers: [
    SkillInventory,
    InstallSkill,
    SkillFiles,
    { provide: SKILL_CATALOG, useClass: FilesystemSkillCatalog },
    { provide: SKILL_INSTALLER, useClass: FilesystemSkillInstaller },
  ],
  exports: [SkillInventory],
})
export class SkillsModule {}
