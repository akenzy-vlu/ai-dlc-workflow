import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { InstallSkill } from '../application/install-skill.use-case';
import { SkillInventory, type SkillWithInstallations } from '../application/skill-inventory.use-case';
import { InstallSkillDto, type SkillView } from './dto/skill.dto';

@Controller('api/skills')
export class SkillsController {
  constructor(
    private readonly inventory: SkillInventory,
    private readonly installer: InstallSkill,
  ) {}

  @Get()
  async list(): Promise<SkillView[]> {
    return (await this.inventory.list()).map(toView);
  }

  /**
   * One verb for both scopes. "Sync" and "install into a project" are the same copy — the
   * skill's own scope decides where it lands — and giving them two endpoints would invite
   * a caller to pick the wrong one for the scope.
   */
  @Post(':id/install')
  async install(@Param('id') id: string, @Body() dto: InstallSkillDto) {
    return this.installer.execute({ skillId: id, repositoryId: dto.repositoryId });
  }
}

function toView({ skill, installations }: SkillWithInstallations): SkillView {
  return {
    id: skill.id,
    declaredName: skill.declaredName,
    description: skill.description,
    scope: skill.scope,
    sourcePath: skill.sourcePath,
    sourceRoot: skill.sourceRoot,
    digest: skill.digest,
    fileCount: skill.fileCount,
    nameMismatch: skill.hasNameMismatch,
    installations: installations.map((installation) => ({
      targetId: installation.targetId,
      targetLabel: installation.targetLabel,
      targetPath: installation.targetPath,
      state: installation.state,
    })),
  };
}
