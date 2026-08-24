import { IsOptional, IsString } from 'class-validator';

import type { InstallationState } from '../../domain/model/skill-installation';
import type { SkillScope } from '../../domain/model/skill-scope';

export class InstallSkillDto {
  /**
   * Which tracked repository to install into. Required for a project-scoped skill and
   * refused for a global one, which has only ever one target.
   */
  @IsOptional()
  @IsString()
  repositoryId?: string;
}

export interface SkillInstallationView {
  targetId: string;
  targetLabel: string;
  targetPath: string;
  state: InstallationState;
}

export interface SkillView {
  id: string;
  declaredName: string;
  description: string;
  scope: SkillScope;
  sourcePath: string;
  sourceRoot: string;
  digest: string;
  fileCount: number;
  nameMismatch: boolean;
  installations: SkillInstallationView[];
}
