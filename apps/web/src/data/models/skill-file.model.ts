/**
 * Wire DTOs for the skill file tree and file content routes — see
 * `SkillFileNodeView` / `SkillFileContentView` in 03-logical-design.md.
 */
export interface SkillFileNodeModel {
  relativePath: string;
  name: string;
  isDirectory: boolean;
  extension: string;
  size: number;
}

export interface SkillFileContentModel {
  relativePath: string;
  content?: string;
  encoding: 'utf8' | 'binary';
  truncated: boolean;
  size: number;
}
