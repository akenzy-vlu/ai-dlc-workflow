import { useMemo, useState } from 'react';
import { App } from 'antd';

import { insightRepository, maintenanceRepository, portfolioRepository } from '@data/repositories';
import type { InboxItem } from '@domain/entities';
import type { InboxKind } from '@domain/enums';
import type { SeverityTab } from './inbox-page.props';
import { InboxPageView } from './inbox-page.view';

export function InboxPage() {
  const { message } = App.useApp();
  const [severity, setSeverity] = useState<SeverityTab>('blocker');
  const [repositoryId, setRepositoryId] = useState<string | undefined>();

  const repositories = portfolioRepository.useRepositories();
  const inbox = insightRepository.useInbox({ repositoryId });
  const sweep = maintenanceRepository.useSweepGates();

  const items = useMemo(() => inbox.data?.items ?? [], [inbox.data]);

  const counts = useMemo<Record<SeverityTab, number>>(
    () => ({
      blocker: items.filter((item) => item.severity === 'blocker').length,
      attention: items.filter((item) => item.severity === 'attention').length,
      hygiene: items.filter((item) => item.severity === 'hygiene').length,
      all: items.length,
    }),
    [items],
  );

  const grouped = useMemo<[InboxKind, InboxItem[]][]>(() => {
    const visible = severity === 'all' ? items : items.filter((item) => item.severity === severity);
    const byKind = new Map<InboxKind, InboxItem[]>();
    for (const item of visible) byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item]);
    return [...byKind.entries()];
  }, [items, severity]);

  return (
    <InboxPageView
      loading={inbox.isLoading}
      fetching={inbox.isFetching}
      severity={severity}
      counts={counts}
      grouped={grouped}
      repositories={repositories.data ?? []}
      repositoryId={repositoryId}
      featuresWithoutGateCheck={inbox.data?.featuresWithoutGateCheck ?? 0}
      sweeping={sweep.isPending}
      onSeverityChange={setSeverity}
      onRepositoryChange={setRepositoryId}
      onRefresh={inbox.refetch}
      onSweep={() => {
        void sweep
          .run()
          .then((result) =>
            result.started
              ? message.loading('checking every feature’s next gate — results appear as they land', 3)
              : message.info(result.reason ?? 'already running'),
          )
          .catch((error: Error) => message.error(error.message));
      }}
    />
  );
}
