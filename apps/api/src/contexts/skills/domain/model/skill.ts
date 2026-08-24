import { Entity } from '../../../../shared/kernel';
import type { SkillScope } from './skill-scope';

export interface SkillProps {
  /** Directory name, which is also the name Claude Code loads it under. */
  id: string;
  /** The `name:` in the frontmatter. Equal to `id` in a well-formed package. */
  declaredName: string;
  description: string;
  scope: SkillScope;
  /** Absolute path of the package in this checkout — the copy source, never a target. */
  sourcePath: string;
  /** Which configured source root it was found under, for display. */
  sourceRoot: string;
  /** Content digest over every file in the package. See `SkillDigest`. */
  digest: string;
  fileCount: number;
  /** Set when the directory name and the declared `name:` disagree. */
  nameMismatch: boolean;
}

/**
 * One installable skill package found in this checkout.
 *
 * Immutable and derived entirely from disk: nothing about a skill is stored in console
 * state, so a package edited in the working tree is reflected on the next read without an
 * import step or a cache to invalidate.
 */
export class Skill extends Entity<string> {
  private constructor(private readonly props: SkillProps) {
    super(props.id);
  }

  static create(props: SkillProps): Skill {
    return new Skill(props);
  }

  get declaredName(): string {
    return this.props.declaredName;
  }
  get description(): string {
    return this.props.description;
  }
  get scope(): SkillScope {
    return this.props.scope;
  }
  get sourcePath(): string {
    return this.props.sourcePath;
  }
  get sourceRoot(): string {
    return this.props.sourceRoot;
  }
  get digest(): string {
    return this.props.digest;
  }
  get fileCount(): number {
    return this.props.fileCount;
  }

  /**
   * A directory named differently from its `name:` loads under the directory name, so the
   * frontmatter is the half that is wrong. Worth surfacing rather than silently
   * preferring one: it is exactly the drift that makes a documented install path 404.
   */
  get hasNameMismatch(): boolean {
    return this.props.nameMismatch;
  }

  get isGlobal(): boolean {
    return this.props.scope === 'global';
  }
}
