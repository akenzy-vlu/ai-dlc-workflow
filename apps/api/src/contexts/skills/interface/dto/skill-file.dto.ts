import { IsString } from 'class-validator';

/**
 * `path` is a query parameter, not a route segment — a segment would swallow the `/`
 * inside a nested relative path like `references/methodology.md`. Mirrors the reasoning
 * `portfolio.controller.ts`'s own `?path=` parameter already applies.
 */
export class SkillFileContentQueryDto {
  @IsString()
  path!: string;
}

/**
 * One entry in a skill package's flat, sorted file listing (`GET /:id/files`).
 *
 * `name` and `extension` are derived from `relativePath` alone and are always accurate.
 * `isDirectory` is always `false` today: `SkillFiles.listFiles` (T-01-02) walks on top of
 * `listPackageFiles()`, which only ever surfaces files, never directories — the client
 * nests the flat list into a tree itself. `size` comes from `listPackageFiles()`'s own
 * per-file `fs.stat`, the same source `03-logical-design.md`'s `SkillFileNode` entity
 * requires it to carry — no separate filesystem call needed here.
 */
export interface SkillFileNodeView {
  relativePath: string;
  name: string;
  isDirectory: boolean;
  extension: string;
  size: number;
}

export interface SkillFileContentView {
  relativePath: string;
  content: string | undefined;
  encoding: 'utf8' | 'binary';
  truncated: boolean;
  size: number;
}
