import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { RefusedError } from '../../../shared/kernel';
import { InstallSkill } from '../application/install-skill.use-case';
import { SkillFiles, type SkillFileEntry } from '../application/skill-files.use-case';
import { SkillInventory, type SkillWithInstallations } from '../application/skill-inventory.use-case';
import { InstallSkillDto, type SkillView } from './dto/skill.dto';
import {
  SkillFileContentQueryDto,
  type SkillFileContentView,
  type SkillFileNodeView,
} from './dto/skill-file.dto';

@Controller('api/skills')
export class SkillsController {
  constructor(
    private readonly inventory: SkillInventory,
    private readonly installer: InstallSkill,
    private readonly files: SkillFiles,
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

  /**
   * `NotFoundError` for an unknown id needs no handling here — `DomainExceptionFilter`
   * already maps it to 404.
   */
  @Get(':id/files')
  async listFiles(@Param('id') id: string): Promise<SkillFileNodeView[]> {
    return (await this.files.listFiles(id)).map(toFileNodeView);
  }

  /**
   * `path` is a query parameter, not a route segment — see `SkillFileContentQueryDto`.
   *
   * `RefusedError` (a path-traversal attempt) is remapped from the filter's default 409 to
   * 400 here specifically, per this ticket's contract: the request is malformed, not a
   * legal operation forbidden by state. `NotFoundError` (unknown id) still falls through to
   * the filter's default 404 unchanged.
   */
  @Get(':id/files/content')
  async readFileContent(
    @Param('id') id: string,
    @Query() query: SkillFileContentQueryDto,
  ): Promise<SkillFileContentView> {
    try {
      return await this.files.readFile(id, query.path);
    } catch (error) {
      if (error instanceof RefusedError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

/**
 * `name` and `extension` are derived from `relativePath` and always accurate. `isDirectory`
 * is always `false` — `SkillFiles.listFiles` walks on top of `listPackageFiles()`, which
 * only ever surfaces files, never directories; the client nests the flat list into a tree
 * itself. `size` comes straight from `SkillFileEntry` (`listPackageFiles`'s per-file `stat`).
 */
function toFileNodeView({ relativePath, size }: SkillFileEntry): SkillFileNodeView {
  const name = relativePath.split('/').pop() ?? relativePath;
  const dotIndex = name.lastIndexOf('.');
  const extension = dotIndex > 0 ? name.slice(dotIndex) : '';
  return { relativePath, name, isDirectory: false, extension, size };
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
