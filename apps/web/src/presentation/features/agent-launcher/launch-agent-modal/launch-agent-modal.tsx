import { useState } from 'react';
import { App } from 'antd';

import { agentRepository, portfolioRepository, preferencesRepository } from '@data/repositories';
import type { LaunchAgentModalProps } from './launch-agent-modal.props';
import { LaunchAgentModalView } from './launch-agent-modal.view';

export function LaunchAgentModal({
  open,
  onClose,
  repositoryId,
  slug,
  ticketId,
  ticketTitle,
  onLaunched,
}: LaunchAgentModalProps) {
  const { message } = App.useApp();
  const { actor } = preferencesRepository.useActor();
  const agents = agentRepository.useAgents();
  const tooling = portfolioRepository.useTooling();
  const briefing = agentRepository.useBriefing(open ? { repositoryId, slug } : null, open ? ticketId : null);
  const launch = agentRepository.useLaunch();

  const [agentId, setAgentId] = useState<string | undefined>();
  const [extra, setExtra] = useState('');
  const [timeoutMinutes, setTimeoutMinutes] = useState<number | null>(30);
  const [acknowledged, setAcknowledged] = useState(false);

  const close = (): void => {
    setExtra('');
    setAcknowledged(false);
    onClose();
  };

  return (
    <LaunchAgentModalView
      open={open}
      ticketId={ticketId}
      ticketTitle={ticketTitle}
      actor={actor}
      agents={agents.data ?? []}
      containerized={tooling.data?.containerized ?? false}
      agentsLoading={agents.isLoading}
      hasAvailableAgent={(agents.data ?? []).some((agent) => agent.available)}
      agentId={agentId}
      extraInstructions={extra}
      timeoutMinutes={timeoutMinutes}
      acknowledged={acknowledged}
      briefing={briefing.data?.briefing}
      launching={launch.isPending}
      onAgentChange={setAgentId}
      onExtraChange={setExtra}
      onTimeoutChange={setTimeoutMinutes}
      onAcknowledgeChange={setAcknowledged}
      onClose={close}
      onLaunch={() => {
        if (!agentId) return;
        void launch
          .run({
            repositoryId,
            slug,
            ticketId,
            agentId,
            launchedBy: actor,
            extraInstructions: extra.trim() || undefined,
            timeoutMinutes: timeoutMinutes ?? 30,
            acknowledged,
          })
          .then(({ runId }) => {
            message.success('agent started — the ticket is now in progress');
            onLaunched?.(runId);
            close();
          })
          .catch((error: Error) => message.error(error.message));
      }}
    />
  );
}
