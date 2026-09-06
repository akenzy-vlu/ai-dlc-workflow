import type { SkillFileContent, SkillFileNode } from '@domain/entities';
import type { SkillFileContentModel, SkillFileNodeModel } from '../models';

export function toSkillFileNode(model: SkillFileNodeModel): SkillFileNode {
  return {
    relativePath: model.relativePath,
    name: model.name,
    isDirectory: model.isDirectory,
    extension: model.extension,
    size: model.size,
  };
}

export function toSkillFileContent(model: SkillFileContentModel): SkillFileContent {
  return {
    relativePath: model.relativePath,
    content: model.content,
    encoding: model.encoding,
    truncated: model.truncated,
    size: model.size,
  };
}
