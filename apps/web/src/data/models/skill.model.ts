import type { SkillInstallationState, SkillScope } from '@domain/enums';

export interface SkillInstallationModel {
  targetId: string;
  targetLabel: string;
  targetPath: string;
  state: SkillInstallationState;
}

export interface SkillModel {
  id: string;
  declaredName: string;
  description: string;
  scope: SkillScope;
  sourcePath: string;
  sourceRoot: string;
  digest: string;
  fileCount: number;
  nameMismatch: boolean;
  installations: SkillInstallationModel[];
}

export interface InstallSkillResultModel {
  skillId: string;
  targetId: string;
  targetPath: string;
  filesWritten: number;
  previousState: SkillInstallationState;
  state: SkillInstallationState;
}
