import { useState } from 'react';

import { insightRepository, portfolioRepository } from '@data/repositories';
import { AuditPageView } from './audit-page.view';

export function AuditPage() {
  const [repositoryId, setRepositoryId] = useState<string | undefined>();
  const repositories = portfolioRepository.useRepositories();
  const audit = insightRepository.useAudit({ repositoryId, limit: 500 });

  return (
    <AuditPageView
      rows={audit.data ?? []}
      loading={audit.isLoading}
      repositories={repositories.data ?? []}
      repositoryId={repositoryId}
      onRepositoryChange={setRepositoryId}
    />
  );
}
