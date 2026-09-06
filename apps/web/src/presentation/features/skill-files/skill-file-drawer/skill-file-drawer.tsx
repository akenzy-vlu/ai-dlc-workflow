import { useState } from 'react';

import { skillFileRepository } from '@data/repositories';
import type { SkillFileDrawerProps } from './skill-file-drawer.props';
import { SkillFileDrawerView } from './skill-file-drawer.view';
import { SkillFileContentPanel } from './skill-file-content';
import { SkillFileTree } from './skill-file-tree';

const DEFAULT_PATH = 'SKILL.md';

/**
 * A skill package's file tree and raw content, opened from one skill.
 *
 * `skillId` is the catalog id, not any one installation-target row — every installation of
 * the same skill shares that id, so the tree opened from any of them is identical (AC-11).
 *
 * When `skillId` is `null` (the drawer is closed) this renders a closed `Drawer` and calls
 * no query hooks at all: the actual fetching happens in `SkillFileDrawerContent`, which only
 * mounts once a skill is open, rather than conditionally skipping hooks inside one component.
 */
export function SkillFileDrawer({ skillId, onClose }: SkillFileDrawerProps) {
  if (!skillId) {
    return <SkillFileDrawerView open={false} skillId={null} onClose={onClose} tree={null} content={null} />;
  }

  return <SkillFileDrawerContent skillId={skillId} onClose={onClose} />;
}

function SkillFileDrawerContent({ skillId, onClose }: { skillId: string; onClose: () => void }) {
  const [selectedPath, setSelectedPath] = useState(DEFAULT_PATH);

  const files = skillFileRepository.useSkillFiles(skillId);
  const content = skillFileRepository.useSkillFileContent(skillId, selectedPath);

  return (
    <SkillFileDrawerView
      open
      skillId={skillId}
      onClose={onClose}
      tree={
        <SkillFileTree
          nodes={files.data ?? []}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          isLoading={files.isLoading}
          isError={files.isError}
          error={files.error}
          onRetry={files.refetch}
        />
      }
      content={
        <SkillFileContentPanel
          content={content.data}
          isLoading={content.isLoading}
          isError={content.isError}
          error={content.error}
          onRetry={content.refetch}
        />
      }
    />
  );
}
