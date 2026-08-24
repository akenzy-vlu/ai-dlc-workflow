import { describe, expect, it } from 'vitest';

import { RepositoryId } from '../src/shared/kernel';
import { normaliseRemote } from '../src/contexts/portfolio/domain/model/project';
import { RepositorySettings } from '../src/contexts/portfolio/domain/model/repository-settings';
import { GitMetadata, TrackedRepository } from '../src/contexts/portfolio/domain/model/tracked-repository';
import { ProjectGroupingService } from '../src/contexts/portfolio/domain/services/project-grouping.service';

function repo(
  id: string,
  absolutePath: string,
  git: Partial<GitMetadata> | null = null,
  projectOverride: string | null = null,
): TrackedRepository {
  return TrackedRepository.rehydrate({
    id: RepositoryId.create(id),
    label: id,
    absolutePath,
    settings: RepositorySettings.unconfigured(),
    git: git
      ? {
          sha: 'abc1234',
          branch: 'main',
          aiDirTracked: true,
          aiDirDirty: false,
          remoteUrl: null,
          gitDir: `${absolutePath}/.git`,
          commonDir: `${absolutePath}/.git`,
          isWorktree: false,
          ...git,
        }
      : null,
    addedAt: new Date('2026-01-01'),
    lastScannedAt: null,
    projectOverride,
  });
}

describe('normaliseRemote', () => {
  it('reads scp-style, https and ssh urls as the same project', () => {
    const expected = 'github.com/owner/repo';
    expect(normaliseRemote('git@github.com:Owner/repo.git')).toBe(expected);
    expect(normaliseRemote('https://github.com/Owner/repo.git')).toBe(expected);
    expect(normaliseRemote('https://github.com/owner/repo')).toBe(expected);
    expect(normaliseRemote('ssh://git@github.com/Owner/Repo.git')).toBe(expected);
  });

  it('keeps different hosts and paths apart', () => {
    expect(normaliseRemote('git@gitlab.com:owner/repo.git')).toBe('gitlab.com/owner/repo');
    expect(normaliseRemote('git@github.com:owner/other.git')).toBe('github.com/owner/other');
  });

  it('returns null for something that is not a remote', () => {
    expect(normaliseRemote('')).toBeNull();
    expect(normaliseRemote('   ')).toBeNull();
  });
});

describe('ProjectGroupingService', () => {
  const grouping = new ProjectGroupingService();

  it('groups two clones of one remote into one project', () => {
    // This is the case that actually occurs: two checkouts of the same repository on
    // different branches, holding the same plan files.
    const projects = grouping.group([
      repo('erp2', '/work/erp2', { remoteUrl: 'git@github.com:JackTran15/jack-erp.git', branch: 'main' }),
      repo('jack-erp', '/work/jack-erp', {
        remoteUrl: 'git@github.com:JackTran15/jack-erp.git',
        branch: 'ERP-create-recipt',
      }),
    ]);

    expect(projects).toHaveLength(1);
    expect(projects[0].repositoryIds).toEqual(['erp2', 'jack-erp']);
    expect(projects[0].origin).toBe('remote');
    // Named after the remote, not after whichever checkout was registered first.
    expect(projects[0].label).toBe('jack-erp');
  });

  it('groups linked worktrees by their shared common dir', () => {
    const projects = grouping.group([
      repo('main', '/work/app', { gitDir: '/work/app/.git', commonDir: '/work/app/.git' }),
      repo('feature', '/work/app-feature', {
        gitDir: '/work/app/.git/worktrees/feature',
        commonDir: '/work/app/.git',
        isWorktree: true,
      }),
    ]);

    // The primary checkout has no remote here, so it falls to `path` while the worktree
    // resolves by common dir — two groups, which is the honest answer without a remote.
    expect(projects.map((p) => p.origin).sort()).toEqual(['path', 'worktree']);
  });

  it('lets an override beat everything else', () => {
    const projects = grouping.group([
      repo('a', '/work/a', { remoteUrl: 'git@github.com:owner/a.git' }, 'one-system'),
      repo('b', '/work/b', { remoteUrl: 'git@github.com:owner/b.git' }, 'one-system'),
    ]);

    expect(projects).toHaveLength(1);
    expect(projects[0].origin).toBe('override');
    expect(projects[0].label).toBe('one-system');
  });

  it('falls back to the path when there is no git at all', () => {
    const projects = grouping.group([repo('loose', '/work/loose', null)]);
    expect(projects[0].origin).toBe('path');
    expect(projects[0].repositoryIds).toEqual(['loose']);
  });
});
