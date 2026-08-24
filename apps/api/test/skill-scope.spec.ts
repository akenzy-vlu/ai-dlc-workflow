import { describe, expect, it } from 'vitest';

import { RepositoryId } from '../src/shared/kernel';
import { RepositorySettings } from '../src/contexts/portfolio/domain/model/repository-settings';
import { TrackedRepository } from '../src/contexts/portfolio/domain/model/tracked-repository';
import { Skill } from '../src/contexts/skills/domain/model/skill';
import { parseSkillScope, type SkillScope } from '../src/contexts/skills/domain/model/skill-scope';
import { stateFor } from '../src/contexts/skills/domain/model/skill-installation';
import { GLOBAL_TARGET_ID, targetsFor } from '../src/contexts/skills/application/skill-targets';

function skill(id: string, scope: SkillScope, digest = 'aaa'): Skill {
  return Skill.create({
    id,
    declaredName: id,
    description: '',
    scope,
    sourcePath: `/repo/skills/${id}`,
    sourceRoot: '/repo/skills',
    digest,
    fileCount: 3,
    nameMismatch: false,
  });
}

function repo(id: string, absolutePath: string): TrackedRepository {
  return TrackedRepository.rehydrate({
    id: RepositoryId.create(id),
    label: id,
    absolutePath,
    settings: RepositorySettings.unconfigured(),
    git: null,
    addedAt: new Date('2026-01-01'),
    lastScannedAt: null,
    projectOverride: null,
  });
}

describe('parseSkillScope', () => {
  it('reads the two declared scopes', () => {
    expect(parseSkillScope('global')).toBe('global');
    expect(parseSkillScope('project')).toBe('project');
  });

  it('defaults an undeclared scope to project, never to global', () => {
    // The asymmetry is the point: a missing scope must not silently put a stack profile
    // into every repository on the machine.
    expect(parseSkillScope(undefined)).toBe('project');
    expect(parseSkillScope('')).toBe('project');
    expect(parseSkillScope(null)).toBe('project');
  });

  it('refuses a scope it does not know rather than guessing', () => {
    expect(() => parseSkillScope('machine')).toThrow(/expected 'global' or 'project'/);
  });
});

describe('install targets', () => {
  const repositories = [repo('r1', '/work/alpha'), repo('r2', '/work/beta')];

  it('gives a global skill exactly one target however many repos are tracked', () => {
    const targets = targetsFor(skill('ai-dlc-core', 'global'), '/home/me/.claude/skills', repositories);
    expect(targets).toEqual([
      {
        id: GLOBAL_TARGET_ID,
        label: 'This machine',
        packagePath: '/home/me/.claude/skills/ai-dlc-core',
      },
    ]);
  });

  it('gives a project skill one target per tracked repository, under .claude/skills', () => {
    const targets = targetsFor(skill('ai-dlc-verify', 'project'), '/home/me/.claude/skills', repositories);
    expect(targets.map((t) => t.packagePath)).toEqual([
      '/work/alpha/.claude/skills/ai-dlc-verify',
      '/work/beta/.claude/skills/ai-dlc-verify',
    ]);
  });

  it('offers a project skill nowhere to go when nothing is tracked', () => {
    // An empty list is what makes the page say "track a repository first" instead of
    // rendering a button that cannot succeed.
    expect(targetsFor(skill('ai-dlc-verify', 'project'), '/home/me/.claude/skills', [])).toEqual([]);
  });

  it('never routes a project skill to the global home', () => {
    const targets = targetsFor(skill('profile-flutter', 'project'), '/home/me/.claude/skills', repositories);
    expect(targets.every((t) => !t.packagePath.startsWith('/home/me/.claude/skills'))).toBe(true);
  });
});

describe('installation state', () => {
  it('reports a missing directory as not-installed', () => {
    expect(stateFor('aaa', null)).toBe('not-installed');
  });

  it('reports matching content as up-to-date', () => {
    expect(stateFor('aaa', 'aaa')).toBe('up-to-date');
  });

  it('reports any difference as outdated, including a hand-edited target', () => {
    // "outdated" means differs, not older — syncing overwrites either way, so calling a
    // locally edited copy up-to-date would be a lie with consequences.
    expect(stateFor('aaa', 'bbb')).toBe('outdated');
  });
});
