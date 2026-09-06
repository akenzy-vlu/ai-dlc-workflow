/**
 * One entry in a skill package's file tree — flat and sorted as
 * `listPackageFiles()` produces it; nested into a tree client-side.
 */
export interface SkillFileNode {
  relativePath: string;
  name: string;
  isDirectory: boolean;
  extension: string;
  size: number;
}

/**
 * The content of a single file within a skill package.
 *
 * `encoding: 'binary'` carries no `content` — the viewer shows a "preview not
 * available" placeholder instead. `truncated: true` means `content` was cut
 * short of the file's actual `size` because it exceeded the size cap.
 */
export interface SkillFileContent {
  relativePath: string;
  content?: string;
  encoding: 'utf8' | 'binary';
  truncated: boolean;
  size: number;
}
