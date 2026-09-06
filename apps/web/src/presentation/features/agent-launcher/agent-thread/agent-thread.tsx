import { useEffect, useMemo, useRef, useState } from 'react';

import { useAppSelector } from '@app/store';
import { agentRepository } from '@data/repositories';
import type { AgentRun } from '@domain/entities';
import type { AgentThreadProps } from './agent-thread.props';
import { AgentThreadView, ThreadEntryView } from './agent-thread.view';

/**
 * A ticket's agent work, read as one conversation.
 *
 * Fetches the thread's run summaries itself, so any drawer or page can drop it in with
 * nothing more than a ticket reference. Each entry then fetches its own transcript — see
 * `ThreadEntry` below — the same per-run data `AgentRunDrawer` used to fetch for the one
 * run it showed, now repeated per entry instead of thrown away between them.
 *
 * The pane sticks to the bottom while the thread is moving and stops the moment you scroll
 * up. That behaviour used to live in the drawer around a single transcript; it belongs here
 * now, around the whole conversation.
 */
export function AgentThread({ repositoryId, slug, ticketId }: AgentThreadProps) {
  const thread = agentRepository.useThread({ repositoryId, slug }, ticketId);
  const runs = thread.data?.runs ?? [];

  const [follow, setFollow] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => setFollow(true), [ticketId]);

  useEffect(() => {
    if (follow && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [runs.length, follow]);

  return (
    <AgentThreadView
      loading={thread.isLoading}
      empty={!thread.isLoading && runs.length === 0}
      follow={follow}
      bodyRef={bodyRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 40);
      }}
      onFollowAgain={() => setFollow(true)}
    >
      {runs.map((run) => (
        <ThreadEntry key={run.id} run={run} />
      ))}
    </AgentThreadView>
  );
}

/**
 * One entry's transcript, fetched and merged the way `AgentRunDrawer` used to for a single
 * run — a genuine sub-component rather than a loop of hooks, because each entry's fetch and
 * its socket subscription are independent of every other entry's. Reading `agentActivity`
 * by this run's own id is also what keeps a frame for a different ticket's run from ever
 * reaching this entry: nothing here subscribes to any id but its own.
 */
function ThreadEntry({ run }: { run: AgentRun }) {
  const detail = agentRepository.useRun(run.id);
  const streamed = useAppSelector((state) => state.stream.agentLog[run.id]);
  const liveActivity = useAppSelector((state) => state.stream.agentActivity[run.id]);

  const lines = useMemo(() => {
    const seen = new Set<string>();
    return [...(detail.data?.log ?? []), ...(streamed ?? [])].filter((line) => {
      const key = `${line.at}::${line.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [detail.data?.log, streamed]);

  // Undefined: no socket frame has arrived yet — trust the fetched snapshot. Present
  // (activity or null): the socket has spoken, and it is never stale on this run's own id.
  const currentActivity = liveActivity !== undefined ? liveActivity : run.currentActivity;

  return <ThreadEntryView run={run} lines={lines} currentActivity={currentActivity} />;
}
