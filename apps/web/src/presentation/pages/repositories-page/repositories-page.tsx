import { App } from 'antd';

import { portfolioRepository } from '@data/repositories';
import { RepositoriesPageView } from './repositories-page.view';

export function RepositoriesPage() {
  const { message } = App.useApp();
  const repositories = portfolioRepository.useRepositories();
  const tooling = portfolioRepository.useTooling();
  const rescan = portfolioRepository.useRescan();
  const remove = portfolioRepository.useRemoveRepository();

  return (
    <RepositoriesPageView
      repositories={repositories.data ?? []}
      loading={repositories.isLoading}
      tooling={tooling.data}
      rescanning={rescan.isPending}
      onRescan={() => {
        void rescan
          .run()
          .then(() => message.success('re-read .ai/aidlc.yaml and git state for every repository'))
          .catch((error: Error) => message.error(error.message));
      }}
      onRemove={(id) => {
        void remove
          .run(id)
          .then(() => message.success('untracked — nothing on disk was touched'))
          .catch((error: Error) => message.error(error.message));
      }}
    />
  );
}
