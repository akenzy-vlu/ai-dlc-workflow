import type { Skill, SkillInstallation } from '@domain/entities';
import type { SkillInstallationModel, SkillModel } from '../models';

export function toSkillInstallation(model: SkillInstallationModel): SkillInstallation {
  return {
    targetId: model.targetId,
    targetLabel: model.targetLabel,
    targetPath: model.targetPath,
    state: model.state,
  };
}

export function toSkill(model: SkillModel): Skill {
  return {
    id: model.id,
    declaredName: model.declaredName,
    description: model.description,
    scope: model.scope,
    sourcePath: model.sourcePath,
    sourceRoot: model.sourceRoot,
    digest: model.digest,
    fileCount: model.fileCount,
    nameMismatch: model.nameMismatch,
    installations: model.installations.map(toSkillInstallation),
  };
}
