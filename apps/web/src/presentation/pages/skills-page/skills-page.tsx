import { useState } from 'react';
import { App } from 'antd';

import { skillRepository } from '@data/repositories';
import { SkillFileDrawer } from '@presentation/features/skill-files/skill-file-drawer';
import { SkillsPageView } from './skills-page.view';

export function SkillsPage() {
  const { message } = App.useApp();
  const skills = skillRepository.useSkills();
  const install = skillRepository.useInstallSkill();
  // The mutation's own isPending is global to the hook; this narrows the spinner to the
  // row that was actually clicked, which matters when a project skill lists ten targets.
  const [installing, setInstalling] = useState<string | null>(null);
  const [openSkillId, setOpenSkillId] = useState<string | null>(null);

  const run = (id: string, repositoryId: string | undefined, describe: (files: number) => string) => {
    setInstalling(id);
    void install
      .run({ id, repositoryId })
      .then((result) => message.success(describe(result.filesWritten)))
      .catch((error: Error) => message.error(error.message))
      .finally(() => setInstalling(null));
  };

  return (
    <>
      <SkillsPageView
        skills={skills.data ?? []}
        loading={skills.isLoading}
        installing={installing}
        onRefresh={() => skills.refetch()}
        onSync={(id) => run(id, undefined, (files) => `synced ${id} to ~/.claude/skills (${files} files)`)}
        onInstall={(id, repositoryId) =>
          run(id, repositoryId, (files) => `installed ${id} into ${repositoryId} (${files} files)`)
        }
        onOpenFiles={(id) => setOpenSkillId(id)}
      />
      <SkillFileDrawer skillId={openSkillId} onClose={() => setOpenSkillId(null)} />
    </>
  );
}
