import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { AidlcConfig } from '../src/config/aidlc.config';
import { BrowseDirectories } from '../src/contexts/portfolio/application/browse-directories.query';
import type { RepositoryMaintenance } from '../src/contexts/portfolio/application/repository-maintenance.use-case';

/**
 * Touches disk because the property under test is what the filesystem reports — which
 * entries exist, and whether a path escapes the configured roots.
 */
describe('browse directories', () => {
  let root: string;
  let browser: BrowseDirectories;

  const noRepositories = { list: async () => [] } as unknown as RepositoryMaintenance;

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aidlc-browse-')));
    await fs.mkdir(path.join(root, 'projects', 'alpha', '.git'), { recursive: true });
    await fs.mkdir(path.join(root, 'projects', 'alpha', '.ai'), { recursive: true });
    await fs.mkdir(path.join(root, 'projects', 'beta'), { recursive: true });
    await fs.mkdir(path.join(root, 'projects', '.hidden'), { recursive: true });
    await fs.writeFile(path.join(root, 'projects', 'a-file.txt'), 'not a directory');

    browser = new BrowseDirectories({ browseRoots: [root] } as AidlcConfig, noRepositories);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('starts at the first configured root when given nothing', async () => {
    const listing = await browser.list();
    expect(listing.path).toBe(root);
    // Null parent is what stops the UI offering a way above the root.
    expect(listing.parent).toBeNull();
  });

  it('lists only directories, and hides dotfiles', async () => {
    const listing = await browser.list(path.join(root, 'projects'));
    expect(listing.entries.map((e) => e.name)).toEqual(['alpha', 'beta']);
  });

  it('marks what makes a folder worth tracking', async () => {
    const listing = await browser.list(path.join(root, 'projects'));
    const alpha = listing.entries.find((e) => e.name === 'alpha');
    const beta = listing.entries.find((e) => e.name === 'beta');

    expect(alpha).toMatchObject({ isRepository: true, hasPlans: true });
    expect(beta).toMatchObject({ isRepository: false, hasPlans: false });
  });

  it('refuses a path outside the configured roots', async () => {
    // Browsing is a directory-disclosure surface. Behind a shared deployment, an
    // unbounded walk hands over the layout of the whole host.
    await expect(browser.list('/etc')).rejects.toThrow(/outside the directories/);
  });

  it('refuses an escape dressed up as a subpath', async () => {
    await expect(browser.list(path.join(root, '..'))).rejects.toThrow(/outside the directories/);
    await expect(browser.list(`${root}/../../etc`)).rejects.toThrow(/outside the directories/);
  });

  it('does not treat a sibling with the same prefix as inside the root', async () => {
    // `${root}-evil` starts with `${root}` as a string but is not under it; the check has
    // to compare path segments, not characters.
    const sibling = `${root}-evil`;
    await fs.mkdir(sibling, { recursive: true });
    try {
      await expect(browser.list(sibling)).rejects.toThrow(/outside the directories/);
    } finally {
      await fs.rm(sibling, { recursive: true, force: true });
    }
  });

  it('reports an unreadable path as a refusal, not a crash', async () => {
    await expect(browser.list(path.join(root, 'nope'))).rejects.toThrow(/cannot read/);
  });
});
