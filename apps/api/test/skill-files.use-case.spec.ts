import { describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '../src/shared/kernel';
import { SkillFiles } from '../src/contexts/skills/application/skill-files.use-case';
import type { SkillCatalogPort } from '../src/contexts/skills/domain/ports/skill-catalog.port';
import type { Skill } from '../src/contexts/skills/domain/model/skill';
import * as skillDigest from '../src/contexts/skills/infrastructure/skill-digest';

/**
 * A fake SkillCatalogPort, per the ticket's own note: readFile's delegation to
 * readPackageFile must be provable without touching a real filesystem.
 */
function fakeCatalog(skill: Skill | null): SkillCatalogPort {
  return {
    discover: vi.fn().mockResolvedValue(skill ? [skill] : []),
    find: vi.fn().mockResolvedValue(skill),
  };
}

function makeSkill(sourcePath: string): Skill {
  return {
    id: 'sample',
    declaredName: 'sample',
    description: 'a sample skill',
    scope: 'global',
    sourcePath,
    sourceRoot: '/skills',
    digest: 'deadbeef',
    fileCount: 1,
    hasNameMismatch: false,
    isGlobal: true,
  } as unknown as Skill;
}

describe('SkillFiles', () => {
  describe('listFiles', () => {
    it('throws NotFoundError("skill", id) — the same not-found shape SkillInventory uses — for an unknown id', async () => {
      const catalog = fakeCatalog(null);
      const useCase = new SkillFiles(catalog);

      await expect(useCase.listFiles('missing')).rejects.toThrow(NotFoundError);
      await expect(useCase.listFiles('missing')).rejects.toMatchObject({
        message: expect.stringContaining('missing'),
      });
    });

    it('lists the package files for a known id', async () => {
      const skill = makeSkill('/checkout/skills/sample');
      const catalog = fakeCatalog(skill);
      vi.spyOn(skillDigest, 'listPackageFiles').mockResolvedValue([
        { relativePath: 'SKILL.md', absolutePath: '/checkout/skills/sample/SKILL.md', size: 42 },
        { relativePath: 'scripts/run.py', absolutePath: '/checkout/skills/sample/scripts/run.py', size: 7 },
      ]);
      const useCase = new SkillFiles(catalog);

      const files = await useCase.listFiles('sample');

      expect(skillDigest.listPackageFiles).toHaveBeenCalledWith('/checkout/skills/sample');
      expect(files).toEqual([
        { relativePath: 'SKILL.md', size: 42 },
        { relativePath: 'scripts/run.py', size: 7 },
      ]);
    });
  });

  describe('readFile', () => {
    it('throws NotFoundError("skill", id) for an unknown id, the same way listFiles does', async () => {
      const catalog = fakeCatalog(null);
      const useCase = new SkillFiles(catalog);

      await expect(useCase.readFile('missing', 'SKILL.md')).rejects.toThrow(NotFoundError);
    });

    it("delegates to readPackageFile with the skill's actual sourcePath and the given relativePath", async () => {
      const skill = makeSkill('/checkout/skills/sample');
      const catalog = fakeCatalog(skill);
      const fakeContent = {
        relativePath: 'SKILL.md',
        content: '# sample',
        encoding: 'utf8' as const,
        truncated: false,
        size: 8,
      };
      vi.spyOn(skillDigest, 'readPackageFile').mockResolvedValue(fakeContent);
      const useCase = new SkillFiles(catalog);

      const result = await useCase.readFile('sample', 'SKILL.md');

      expect(skillDigest.readPackageFile).toHaveBeenCalledWith('/checkout/skills/sample', 'SKILL.md');
      expect(result).toEqual(fakeContent);
    });

    it('lets a RefusedError from readPackageFile propagate untouched', async () => {
      const { RefusedError } = await import('../src/shared/kernel');
      const skill = makeSkill('/checkout/skills/sample');
      const catalog = fakeCatalog(skill);
      vi.spyOn(skillDigest, 'readPackageFile').mockRejectedValue(
        new RefusedError('refused: ../outside.txt escapes the package root', {}),
      );
      const useCase = new SkillFiles(catalog);

      await expect(useCase.readFile('sample', '../outside.txt')).rejects.toThrow(RefusedError);
    });
  });
});
