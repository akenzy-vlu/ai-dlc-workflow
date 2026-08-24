import { Inject, Injectable, Logger } from '@nestjs/common';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { NotFoundError, RefusedError } from '../../../shared/kernel';
import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import { stateFor, type InstallationState } from '../domain/model/skill-installation';
import { SKILL_CATALOG, type SkillCatalogPort } from '../domain/ports/skill-catalog.port';
import { SKILL_INSTALLER, type SkillInstallerPort } from '../domain/ports/skill-installer.port';
import { GLOBAL_TARGET_ID, targetsFor } from './skill-targets';

export interface InstallSkillInput {
  skillId: string;
  /** Required for a project-scoped skill, meaningless for a global one. */
  repositoryId?: string;
}

export interface InstallSkillResult {
  skillId: string;
  targetId: string;
  targetPath: string;
  filesWritten: number;
  /** What the target looked like before this ran, so the UI can say what happened. */
  previousState: InstallationState;
  state: InstallationState;
}

/**
 * Installs one skill package to one target — "sync" for a global skill, "install into a
 * project" for a project-scoped one. The same copy either way; only the target differs,
 * and the target is decided by the skill's declared scope rather than by the caller.
 *
 * That asymmetry is deliberate. Letting the request name an arbitrary destination would
 * make it possible to sync a stack profile machine-wide, which is the one outcome the
 * scope exists to prevent.
 */
@Injectable()
export class InstallSkill {
  private readonly logger = new Logger(InstallSkill.name);

  constructor(
    @Inject(SKILL_CATALOG) private readonly catalog: SkillCatalogPort,
    @Inject(SKILL_INSTALLER) private readonly installer: SkillInstallerPort,
    @Inject(AIDLC_CONFIG) private readonly config: AidlcConfig,
    private readonly repositories: RepositoryMaintenance,
  ) {}

  async execute(input: InstallSkillInput): Promise<InstallSkillResult> {
    const skill = await this.catalog.find(input.skillId);
    if (!skill) throw new NotFoundError('skill', input.skillId);

    if (skill.isGlobal && input.repositoryId && input.repositoryId !== GLOBAL_TARGET_ID) {
      throw new RefusedError(
        `refused: ${skill.id} is a global skill — it syncs to ${this.config.globalSkillsHome}, not into a repository`,
        { skill: skill.id, scope: skill.scope },
      );
    }
    if (!skill.isGlobal && !input.repositoryId) {
      throw new RefusedError(
        `refused: ${skill.id} is a project skill — name the repository to install it into`,
        { skill: skill.id, scope: skill.scope },
      );
    }

    // Resolving the repository first turns an unknown id into a 404 naming the id, rather
    // than an empty target list that would read as "this skill has nowhere to go".
    const tracked = skill.isGlobal
      ? []
      : [await this.repositories.require(input.repositoryId as string)];

    const targets = targetsFor(skill, this.config.globalSkillsHome, tracked);
    const target = skill.isGlobal
      ? targets[0]
      : targets.find((candidate) => candidate.id === input.repositoryId);
    if (!target) throw new NotFoundError('install target', input.repositoryId ?? GLOBAL_TARGET_ID);

    const previousState = stateFor(skill.digest, await this.installer.digestOf(target.packagePath));
    const filesWritten = await this.installer.install(skill, target.packagePath);
    this.logger.log(`installed ${skill.id} → ${target.packagePath} (${filesWritten} files)`);

    return {
      skillId: skill.id,
      targetId: target.id,
      targetPath: target.packagePath,
      filesWritten,
      previousState,
      state: stateFor(skill.digest, await this.installer.digestOf(target.packagePath)),
    };
  }
}
