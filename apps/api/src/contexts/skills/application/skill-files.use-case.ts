import { Inject, Injectable } from '@nestjs/common';

import { NotFoundError } from '../../../shared/kernel';
import { SKILL_CATALOG, type SkillCatalogPort } from '../domain/ports/skill-catalog.port';
import { listPackageFiles, readPackageFile, type PackageFileContent } from '../infrastructure/skill-digest';

export interface SkillFileEntry {
  relativePath: string;
  size: number;
}

/**
 * Resolves a skill id to its `sourcePath` and delegates to the file-walking primitives in
 * `skill-digest.ts` — the same id resolution `SkillInventory` already does via
 * `SkillCatalogPort.find`, reused here rather than duplicated.
 *
 * Pure read, like `SkillInventory`: it never writes anything.
 */
@Injectable()
export class SkillFiles {
  constructor(@Inject(SKILL_CATALOG) private readonly catalog: SkillCatalogPort) {}

  async listFiles(id: string): Promise<SkillFileEntry[]> {
    const skill = await this.catalog.find(id);
    if (!skill) throw new NotFoundError('skill', id);

    const files = await listPackageFiles(skill.sourcePath);
    return files.map((file) => ({ relativePath: file.relativePath, size: file.size }));
  }

  async readFile(id: string, relativePath: string): Promise<PackageFileContent> {
    const skill = await this.catalog.find(id);
    if (!skill) throw new NotFoundError('skill', id);

    // RefusedError (path escapes the root) and any other error from readPackageFile
    // propagate untouched — the controller (T-01-03) owns HTTP status mapping.
    return readPackageFile(skill.sourcePath, relativePath);
  }
}
