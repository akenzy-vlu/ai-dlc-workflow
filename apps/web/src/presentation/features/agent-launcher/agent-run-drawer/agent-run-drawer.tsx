import { useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';

import { useAppSelector } from '@app/store';
import { agentRepository } from '@data/repositories';
import type { AgentRunDrawerProps } from './agent-run-drawer.props';
import { AgentRunDrawerView } from './agent-run-drawer.view';

/**
 * The live transcript of one agent run.
 *
 * Fetched output and streamed output are merged and de-duplicated: the initial fetch may
 * already contain lines the socket then re-delivers, and neither side is authoritative
 * about which arrived first.
 *
 * The pane sticks to the bottom while a run is going and stops the moment you scroll up,
 * because losing your position every second is what makes a live log unreadable.
 */
export function AgentRunDrawer({ runId, onClose }: AgentRunDrawerProps) {
  const { message } = App.useApp();
  const run = agentRepository.useRun(runId);
  const cancel = agentRepository.useCancel();
  const streamed = useAppSelector((state) => (runId ? state.stream.agentLog[runId] : undefined));

  const [follow, setFollow] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    const seen = new Set<string>();
    return [...(run.data?.log ?? []), ...(streamed ?? [])].filter((line) => {
      const key = `${line.at}::${line.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [run.data?.log, streamed]);

  useEffect(() => setFollow(true), [runId]);

  useEffect(() => {
    if (follow && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines.length, follow]);

  return (
    <AgentRunDrawerView
      open={runId !== null}
      run={run.data}
      lines={lines}
      cancelling={cancel.isPending}
      follow={follow}
      bodyRef={bodyRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 40);
      }}
      onFollowAgain={() => setFollow(true)}
      onClose={onClose}
      onCancel={() => {
        if (!runId) return;
        void cancel
          .run(runId)
          .then(({ cancelled }) =>
            cancelled ? message.info('sent SIGTERM') : message.warning('that run is no longer active'),
          )
          .catch((error: Error) => message.error(error.message));
      }}
    />
  );
}
