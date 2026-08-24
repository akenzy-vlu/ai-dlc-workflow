import { useState } from 'react';
import { App } from 'antd';

import { agentRepository, portfolioRepository, preferencesRepository } from '@data/repositories';
import type { LaunchReadyModalProps } from './launch-ready-modal.props';
import { LaunchReadyModalView } from './launch-ready-modal.view';

/** Mirrors the server's rule, for the preview only. The server decides for real. */
export function pickable(tickets: LaunchReadyModalProps['tickets']) {
  return tickets.filter(
    (t) => t.status !== 'done' && t.status !== 'blocked' && t.unmetDependencies === 0,
  );
}

export function LaunchReadyModal({ open, repositoryId, slug, tickets, onClose }: LaunchReadyModalProps) {
  const { message } = App.useApp();
  const { actor } = preferencesRepository.useActor();
  const agents = agentRepository.useAgents();
  const tooling = portfolioRepository.useTooling();
  const launch = agentRepository.useLaunchReady();

  const [agentId, setAgentId] = useState<string | undefined>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<LaunchReadyModalViewResult>(null);

  const close = (): void => {
    setAcknowledged(false);
    setResult(null);
    onClose();
  };

  return (
    <LaunchReadyModalView
      open={open}
      candidates={pickable(tickets)}
      actor={actor}
      agents={agents.data ?? []}
      agentsLoading={agents.isLoading}
      hasAvailableAgent={(agents.data ?? []).some((a) => a.available)}
      containerized={tooling.data?.containerized ?? false}
      agentId={agentId}
      acknowledged={acknowledged}
      launching={launch.isPending}
      result={result}
      onAgentChange={setAgentId}
      onAcknowledgeChange={setAcknowledged}
      onLaunch={() => {
        if (!agentId) return;
        void launch
          .run({ repositoryId, slug, agentId, acknowledged, launchedBy: actor })
          .then((outcome) => {
            setResult(outcome);
            message.success(
              `${outcome.launched.length} agent${outcome.launched.length === 1 ? '' : 's'} launched`,
            );
          })
          .catch((error: Error) => message.error(error.message));
      }}
      onClose={close}
    />
  );
}

type LaunchReadyModalViewResult =
  | { launched: { ticketId: string }[]; skipped: { ticketId: string; reason: string }[] }
  | null;
