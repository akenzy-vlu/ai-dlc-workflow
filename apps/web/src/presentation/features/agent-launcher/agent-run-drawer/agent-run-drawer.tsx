import { App } from 'antd';

import { agentRepository } from '@data/repositories';
import { TERMINAL_RUN_STATUSES } from '@domain/enums';
import { AgentThread } from '../agent-thread/agent-thread';
import { ReplyComposer } from '../agent-thread/reply-composer/reply-composer';
import type { AgentRunDrawerProps } from './agent-run-drawer.props';
import { AgentRunDrawerView } from './agent-run-drawer.view';

/**
 * A ticket's agent work, opened from one run.
 *
 * `runId` addresses which transcript put this drawer on the URL — the agents-working pill
 * and the runs table both link to a specific run — but what opens is the whole thread that
 * run belongs to: the ticket it was launched against, and every run and reply on it. The
 * opened run is fetched only to learn which ticket that is; `AgentThread` then fetches the
 * thread itself and owns everything the conversation shows.
 *
 * Stop targets whichever run in the thread is still going, not necessarily the one that was
 * opened — a reply started after this drawer was opened is a different run id, and it is
 * the one actually doing anything.
 */
export function AgentRunDrawer({ runId, onClose }: AgentRunDrawerProps) {
  const { message } = App.useApp();
  const openedRun = agentRepository.useRun(runId);
  const repositoryId = openedRun.data?.repositoryId ?? null;
  const slug = openedRun.data?.slug ?? null;
  const ticketId = openedRun.data?.ticketId ?? null;

  const thread = agentRepository.useThread(
    repositoryId && slug ? { repositoryId, slug } : null,
    ticketId,
  );
  const cancel = agentRepository.useCancel();

  const runs = thread.data?.runs ?? [];
  const activeRun = runs.find((r) => !TERMINAL_RUN_STATUSES.includes(r.status)) ?? null;
  const latest = runs.length ? runs[runs.length - 1] : openedRun.data ?? null;

  return (
    <AgentRunDrawerView
      open={runId !== null}
      ticketId={ticketId}
      status={activeRun?.status ?? latest?.status ?? null}
      agentLabel={latest?.agentLabel ?? null}
      repositoryLabel={openedRun.data?.repositoryLabel ?? null}
      slug={slug}
      cwd={openedRun.data?.cwd ?? null}
      cancelling={cancel.isPending}
      canCancel={activeRun !== null}
      onClose={onClose}
      onCancel={() => {
        if (!activeRun) return;
        void cancel
          .run(activeRun.id)
          .then(({ cancelled }) =>
            cancelled ? message.info('sent SIGTERM') : message.warning('that run is no longer active'),
          )
          .catch((error: Error) => message.error(error.message));
      }}
    >
      {repositoryId && slug && ticketId ? (
        <>
          <AgentThread repositoryId={repositoryId} slug={slug} ticketId={ticketId} />
          <ReplyComposer repositoryId={repositoryId} slug={slug} ticketId={ticketId} />
        </>
      ) : null}
    </AgentRunDrawerView>
  );
}
