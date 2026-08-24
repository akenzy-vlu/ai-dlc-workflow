import { useState } from 'react';
import { App } from 'antd';

import { portfolioRepository } from '@data/repositories';
import type { DiscoveredRepository } from '@domain/entities';
import { RepositoryRegisterView } from './repository-register.view';

export function RepositoryRegister() {
  const { message } = App.useApp();
  const add = portfolioRepository.useAddRepository();
  const discover = portfolioRepository.useDiscoverRepositories();

  const [open, setOpen] = useState(false);
  const [path, setPath] = useState('');
  const [root, setRoot] = useState('');
  const [found, setFound] = useState<DiscoveredRepository[]>([]);
  // Which input the picker is filling. One picker serves both fields, because they take
  // the same kind of value and two modals would be two things to keep in step.
  const [browsing, setBrowsing] = useState<'path' | 'root' | null>(null);

  return (
    <RepositoryRegisterView
      open={open}
      path={path}
      root={root}
      found={found}
      adding={add.isPending}
      scanning={discover.isPending}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onPathChange={setPath}
      onRootChange={setRoot}
      onAdd={(absolutePath) => {
        void add
          .run({ absolutePath })
          .then((repository) => {
            message.success(`tracking ${repository.label}`);
            setFound((previous) =>
              previous.map((candidate) =>
                candidate.absolutePath === repository.absolutePath
                  ? { ...candidate, alreadyTracked: true }
                  : candidate,
              ),
            );
            setPath('');
          })
          .catch((error: Error) => message.error(error.message));
      }}
      browsing={browsing}
      onBrowse={setBrowsing}
      onBrowseCancel={() => setBrowsing(null)}
      onBrowsePick={(absolutePath) => {
        if (browsing === 'root') setRoot(absolutePath);
        else setPath(absolutePath);
        setBrowsing(null);
      }}
      onScan={() => {
        if (!root.trim()) return;
        void discover
          .run({ root: root.trim() })
          .then((results) => {
            setFound(results);
            if (results.length === 0) {
              message.info('no repositories with .ai/features/ found under that path');
            }
          })
          .catch((error: Error) => message.error(error.message));
      }}
    />
  );
}
