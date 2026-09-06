import type { ReactNode } from 'react';

export interface SkillFileDrawerProps {
  /** The catalog id of the skill whose files to show, or `null` when the drawer is closed. */
  skillId: string | null;
  onClose: () => void;
}

export interface SkillFileDrawerViewProps {
  open: boolean;
  skillId: string | null;
  onClose: () => void;
  /** The `SkillFileTree`, composed by the container so this view stays unaware of it. */
  tree: ReactNode;
  /** The `SkillFileContentPanel`, composed by the container. */
  content: ReactNode;
}
