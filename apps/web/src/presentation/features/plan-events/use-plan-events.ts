import { useEffect } from 'react';

import {
  agentActivityReceived,
  agentLineReceived,
  gateSweepProgress,
  setupProgressReceived,
  useAppDispatch,
} from '@app/store';
import { consoleApi } from '@data/datasource/remote';
import { subscribeToPlanEvents } from '@data/datasource/socket';

/**
 * Wires the server's push channel into the store, once, at the shell.
 *
 * Mounted in one place rather than per page so a browser holds one subscription however
 * many components care. Plan changes invalidate cache tags — RTK Query then refetches
 * only what something is actually rendering — while agent and install output goes into a
 * slice, because a line of a transcript is not a cacheable resource and pushing each one
 * through the cache would invalidate the world hundreds of times per run.
 */
export function usePlanEvents(): void {
  const dispatch = useAppDispatch();

  useEffect(
    () =>
      subscribeToPlanEvents({
        onPlanChanged: () => {
          dispatch(
            consoleApi.util.invalidateTags([
              'Portfolio',
              'Inbox',
              'ReadyQueue',
              'Board',
              'Feature',
              'Audit',
              'Verification',
            ]),
          );
        },

        onGateSweep: ({ done, total }) => {
          dispatch(gateSweepProgress({ done, total }));
          if (done === total) dispatch(consoleApi.util.invalidateTags(['Portfolio', 'Inbox']));
        },

        onAgentRun: (event) => {
          if (event.line) {
            dispatch(agentLineReceived({ runId: event.runId, line: event.line }));
            return;
          }
          // A status/activity frame, not output. What the agent is doing moves into the
          // stream slice directly — a thread reads it with no fetch involved, which is
          // the whole point of a push channel; `activity: null` is what makes a finished
          // run's "currently doing" line disappear the instant it stops, not on whatever
          // schedule the invalidation below happens to refetch on.
          dispatch(agentActivityReceived({ runId: event.runId, activity: event.activity }));
          // The run list and the run itself moved too — exitCode, telemetry, finishedAt
          // are not on this frame, so those still need the fetch this invalidation causes.
          dispatch(
            consoleApi.util.invalidateTags([
              'AgentRun',
              { type: 'AgentRun', id: event.runId },
              ...(event.status === 'running'
                ? []
                : (['Portfolio', 'Board', 'ReadyQueue', 'Feature'] as const)),
            ]),
          );
        },

        onSetupProgress: (event) => {
          dispatch(setupProgressReceived(event));
          if (event.state === 'failed' || (event.step === 'verify' && event.state === 'done')) {
            dispatch(consoleApi.util.invalidateTags(['Runner', 'Verification']));
          }
        },
      }),
    [dispatch],
  );
}
