import type { Skill } from '@domain/entities';

export interface SkillsPageViewProps {
  skills: Skill[];
  loading: boolean;
  /** Id of the skill currently being written, so only its row shows a spinner. */
  installing: string | null;
  onRefresh: () => void;
  onSync: (skillId: string) => void;
  onInstall: (skillId: string, repositoryId: string) => void;
  /** Opens the file-browsing drawer for this skill's catalog id. */
  onOpenFiles: (skillId: string) => void;
}
