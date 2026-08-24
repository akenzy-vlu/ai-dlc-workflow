import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { RefusedError } from '../../../shared/kernel';
import type { Skill } from '../domain/model/skill';
import type { SkillInstallerPort } from '../domain/ports/skill-installer.port';
import { digestPackage, listPackageFiles } from './skill-digest';

@Injectable()
export class FilesystemSkillInstaller implements SkillInstallerPort {
  async digestOf(packagePath: string): Promise<string | null> {
    return digestPackage(packagePath);
  }

  async install(skill: Skill, targetPath: string): Promise<number> {
    // Copying a package onto itself would delete it: the swap below removes the target
    // before moving the staged copy into place. Refusing is the only safe answer, and it
    // is reachable — point AIDLC_SKILL_SOURCES at ~/.claude/skills and every sync is one.
    if (path.resolve(targetPath) === path.resolve(skill.sourcePath)) {
      throw new RefusedError(
        `refused: ${skill.id} would be installed over its own source at ${targetPath}`,
        { skill: skill.id, targetPath },
      );
    }

    const files = await listPackageFiles(skill.sourcePath);
    if (files.length === 0) {
      throw new RefusedError(`refused: ${skill.id} has no files to install`, { skill: skill.id });
    }

    // Stage beside the target, then swap. A copy written directly into place leaves a
    // half-written package behind if it fails midway, and a half-written skill still
    // loads — with whichever files happened to land first.
    const parent = path.dirname(targetPath);
    await fs.mkdir(parent, { recursive: true });
    const staging = path.join(parent, `.${skill.id}.installing`);
    await fs.rm(staging, { recursive: true, force: true });

    try {
      for (const file of files) {
        const destination = path.join(staging, file.relativePath);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(file.absolutePath, destination);
      }
      await fs.rm(targetPath, { recursive: true, force: true });
      await fs.rename(staging, targetPath);
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }

    return files.length;
  }
}
