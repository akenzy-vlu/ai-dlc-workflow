import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Skill } from '../src/contexts/skills/domain/model/skill';
import { FilesystemSkillInstaller } from '../src/contexts/skills/infrastructure/filesystem-skill-installer';
import { digestPackage } from '../src/contexts/skills/infrastructure/skill-digest';

/**
 * Touches disk on purpose, like the evidence-store spec: the properties under test — that
 * a sync is atomic, and that Python bytecode never counts as a change — are properties of
 * the filesystem layout. A mocked fs would assert the mock.
 */
describe('skill installer', () => {
  let root: string;
  let source: string;
  let installer: FilesystemSkillInstaller;

  const skill = (sourcePath: string, digest = '') =>
    Skill.create({
      id: 'ai-dlc-core',
      declaredName: 'ai-dlc-core',
      description: '',
      scope: 'global',
      sourcePath,
      sourceRoot: path.dirname(sourcePath),
      digest,
      fileCount: 0,
      nameMismatch: false,
    });

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aidlc-skills-'));
    source = path.join(root, 'src', 'ai-dlc-core');
    await fs.mkdir(path.join(source, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(source, 'SKILL.md'), '---\nname: ai-dlc-core\nscope: global\n---\n');
    await fs.writeFile(path.join(source, 'scripts', 'aidlc.py'), 'print("hi")\n');
    installer = new FilesystemSkillInstaller();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('copies the package to a target that does not exist yet', async () => {
    const target = path.join(root, 'home', '.claude', 'skills', 'ai-dlc-core');
    const written = await installer.install(skill(source), target);

    expect(written).toBe(2);
    expect(await fs.readFile(path.join(target, 'scripts', 'aidlc.py'), 'utf8')).toBe('print("hi")\n');
  });

  it('leaves the source and the target byte-identical, so a fresh sync reads up-to-date', async () => {
    const target = path.join(root, 'home', 'ai-dlc-core');
    await installer.install(skill(source), target);

    expect(await digestPackage(target)).toBe(await digestPackage(source));
  });

  it('ignores __pycache__ on both sides', async () => {
    // The regression this guards: running the controller once writes bytecode into the
    // installed copy, and a naive digest would then report every global skill as outdated
    // one command after syncing it.
    const target = path.join(root, 'home', 'ai-dlc-core');
    await installer.install(skill(source), target);

    await fs.mkdir(path.join(target, 'scripts', '__pycache__'), { recursive: true });
    await fs.writeFile(path.join(target, 'scripts', '__pycache__', 'aidlc.cpython-314.pyc'), 'bytecode');
    await fs.writeFile(path.join(target, '.DS_Store'), 'finder');

    expect(await digestPackage(target)).toBe(await digestPackage(source));
  });

  it('removes a file that no longer exists upstream instead of merging', async () => {
    const target = path.join(root, 'home', 'ai-dlc-core');
    await installer.install(skill(source), target);
    await fs.writeFile(path.join(target, 'stale.md'), 'left over from an older version');

    await installer.install(skill(source), target);

    await expect(fs.access(path.join(target, 'stale.md'))).rejects.toThrow();
  });

  it('leaves no staging directory behind', async () => {
    const target = path.join(root, 'home', 'ai-dlc-core');
    await installer.install(skill(source), target);

    expect(await fs.readdir(path.join(root, 'home'))).toEqual(['ai-dlc-core']);
  });

  it('refuses to install a package over its own source', async () => {
    // Reachable by pointing AIDLC_SKILL_SOURCES at ~/.claude/skills; the swap would
    // delete the target before moving the staged copy in, i.e. delete the source.
    await expect(installer.install(skill(source), source)).rejects.toThrow(/over its own source/);
    expect(await fs.readdir(source)).toContain('SKILL.md');
  });

  it('digests a missing directory as null rather than as empty', async () => {
    expect(await installer.digestOf(path.join(root, 'nope'))).toBeNull();
  });
});
