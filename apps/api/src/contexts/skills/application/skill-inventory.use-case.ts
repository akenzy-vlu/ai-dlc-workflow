import { Inject, Injectable } from '@nestjs/common';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import type { Skill } from '../domain/model/skill';
import { stateFor, type SkillInstallation } from '../domain/model/skill-installation';
import { SKILL_CATALOG, type SkillCatalogPort } from '../domain/ports/skill-catalog.port';
import { SKILL_INSTALLER, type SkillInstallerPort } from '../domain/ports/skill-installer.port';
import { targetsFor } from './skill-targets';

export interface SkillWithInstallations {
  skill: Skill;
  installations: SkillInstallation[];
}

/**
 * Reads every skill package in this checkout and, for each, where it stands at every
 * target its scope permits.
 *
 * Pure read: it digests directories and compares, and writes nothing anywhere.
 */
@Injectable()
export class SkillInventory {
  constructor(
    @Inject(SKILL_CATALOG) private readonly catalog: SkillCatalogPort,
    @Inject(SKILL_INSTALLER) private readonly installer: SkillInstallerPort,
    @Inject(AIDLC_CONFIG) private readonly config: AidlcConfig,
    private readonly repositories: RepositoryMaintenance,
  ) {}

  async list(): Promise<SkillWithInstallations[]> {
    const [skills, tracked] = await Promise.all([
      this.catalog.discover(),
      this.repositories.list(),
    ]);

    return Promise.all(
      skills.map(async (skill) => {
        const targets = targetsFor(skill, this.config.globalSkillsHome, tracked);
        const installations = await Promise.all(
          targets.map(async (target): Promise<SkillInstallation> => {
            const installedDigest = await this.installer.digestOf(target.packagePath);
            return {
              targetId: target.id,
              targetLabel: target.label,
              targetPath: target.packagePath,
              scope: skill.scope,
              state: stateFor(skill.digest, installedDigest),
              installedDigest,
            };
          }),
        );
        return { skill, installations };
      }),
    );
  }
}
