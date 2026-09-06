import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { NotFoundError } from '../src/shared/kernel';
import { Skill } from '../src/contexts/skills/domain/model/skill';
import type { SkillCatalogPort } from '../src/contexts/skills/domain/ports/skill-catalog.port';
import { SkillFiles } from '../src/contexts/skills/application/skill-files.use-case';
import { SkillInventory } from '../src/contexts/skills/application/skill-inventory.use-case';
import { InstallSkill } from '../src/contexts/skills/application/install-skill.use-case';
import { SkillsController } from '../src/contexts/skills/interface/skills.controller';

/**
 * Touches disk on purpose, like `skill-installer.spec.ts` and `skill-files.spec.ts`: the
 * property under test — that `IGNORED` paths never surface and that a traversal attempt
 * never reaches file content — is a property of a real filesystem, not of a mock.
 */
describe('SkillsController — files routes', () => {
  let root: string;
  let source: string;
  let controller: SkillsController;

  const skill = (sourcePath: string) =>
    Skill.create({
      id: 'sample',
      declaredName: 'sample',
      description: 'a sample skill',
      scope: 'global',
      sourcePath,
      sourceRoot: path.dirname(sourcePath),
      digest: 'deadbeef',
      fileCount: 2,
      nameMismatch: false,
    });

  function catalogFor(found: Skill | null): SkillCatalogPort {
    return {
      discover: vi.fn().mockResolvedValue(found ? [found] : []),
      find: vi.fn().mockImplementation(async (id: string) => (found && found.id === id ? found : null)),
    };
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aidlc-skills-controller-'));
    source = path.join(root, 'sample');
    await fs.mkdir(path.join(source, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(source, '__pycache__'), { recursive: true });
    await fs.writeFile(path.join(source, 'SKILL.md'), '---\nname: sample\n---\n# sample\n');
    await fs.writeFile(path.join(source, 'scripts', 'aidlc.py'), 'print("hi")\n');
    await fs.writeFile(path.join(source, '__pycache__', 'aidlc.cpython-314.pyc'), 'bytecode');

    const files = new SkillFiles(catalogFor(skill(source)));
    // The two other use cases are irrelevant to these routes; undefined stands in since
    // the controller never calls them here.
    controller = new SkillsController(
      undefined as unknown as SkillInventory,
      undefined as unknown as InstallSkill,
      files,
    );
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('GET /:id/files', () => {
    it('lists the package files, excluding every IGNORED path (AC-01)', async () => {
      const nodes = await controller.listFiles('sample');

      expect(nodes.map((n) => n.relativePath)).toEqual(['SKILL.md', 'scripts/aidlc.py']);
      expect(nodes.some((n) => n.relativePath.includes('__pycache__'))).toBe(false);
      expect(nodes.every((n) => n.isDirectory === false)).toBe(true);

      const skillMd = nodes.find((n) => n.relativePath === 'SKILL.md')!;
      expect(skillMd.name).toBe('SKILL.md');
      expect(skillMd.extension).toBe('.md');
      expect(skillMd.size).toBe(Buffer.byteLength('---\nname: sample\n---\n# sample\n'));

      const script = nodes.find((n) => n.relativePath === 'scripts/aidlc.py')!;
      expect(script.name).toBe('aidlc.py');
      expect(script.extension).toBe('.py');
      expect(script.size).toBe(Buffer.byteLength('print("hi")\n'));
    });

    it('throws NotFoundError for an unknown skill id, which the exception filter maps to 404', async () => {
      const files = new SkillFiles(catalogFor(null));
      const emptyController = new SkillsController(
        undefined as unknown as SkillInventory,
        undefined as unknown as InstallSkill,
        files,
      );

      await expect(emptyController.listFiles('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('GET /:id/files/content', () => {
    it('returns the raw content of an existing file (round trip)', async () => {
      const result = await controller.readFileContent('sample', { path: 'SKILL.md' });

      expect(result).toEqual({
        relativePath: 'SKILL.md',
        content: '---\nname: sample\n---\n# sample\n',
        encoding: 'utf8',
        truncated: false,
        size: Buffer.byteLength('---\nname: sample\n---\n# sample\n'),
      });
    });

    it('maps an escaping path to a 400 BadRequestException, not file content', async () => {
      await expect(
        controller.readFileContent('sample', { path: '../../../etc/passwd' }),
      ).rejects.toThrow(BadRequestException);

      try {
        await controller.readFileContent('sample', { path: '../../../etc/passwd' });
        expect.unreachable('expected readFileContent to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getStatus()).toBe(400);
      }
    });

    it('throws NotFoundError for an unknown skill id, which the exception filter maps to 404', async () => {
      const files = new SkillFiles(catalogFor(null));
      const emptyController = new SkillsController(
        undefined as unknown as SkillInventory,
        undefined as unknown as InstallSkill,
        files,
      );

      await expect(emptyController.readFileContent('missing', { path: 'SKILL.md' })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws NotFoundError, not a 400, for a file deleted between list and read', async () => {
      await expect(controller.readFileContent('sample', { path: 'gone.md' })).rejects.toThrow(NotFoundError);
    });
  });
});
