import * as path from 'node:path';

import type { TrackedRepository } from '../../portfolio/domain/model/tracked-repository';
import type { Skill } from '../domain/model/skill';

/** The machine-wide target's synthetic id. Repositories use their own ids. */
export const GLOBAL_TARGET_ID = 'global';

export interface InstallTarget {
  id: string;
  label: string;
  /** Directory that would hold the package itself, i.e. `<root>/<skill id>`. */
  packagePath: string;
}

/** `<repo>/.claude/skills` — the project-scoped install root, committed to the repo. */
export function projectSkillsRoot(repositoryPath: string): string {
  return path.join(repositoryPath, '.claude', 'skills');
}

/**
 * The targets a skill may be installed to, decided by its scope alone.
 *
 * A global skill has exactly one target however many repositories are tracked; a project
 * skill has one per repository and none when nothing is tracked yet. Returning an empty
 * list is the honest answer there — the page then says "track a repository first" rather
 * than offering a button that cannot work.
 */
export function targetsFor(
  skill: Skill,
  globalSkillsHome: string,
  repositories: readonly TrackedRepository[],
): InstallTarget[] {
  if (skill.isGlobal) {
    return [
      {
        id: GLOBAL_TARGET_ID,
        label: 'This machine',
        packagePath: path.join(globalSkillsHome, skill.id),
      },
    ];
  }

  return repositories.map((repository) => ({
    id: repository.id.value,
    label: repository.label,
    packagePath: path.join(projectSkillsRoot(repository.absolutePath), skill.id),
  }));
}
