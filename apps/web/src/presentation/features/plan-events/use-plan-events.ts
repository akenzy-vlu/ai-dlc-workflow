import { useEffect } from 'react';

import { agentLineReceived, gateSweepProgress, setupProgressReceived, useAppDispatch } from '@app/store';
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
          // A status change, not output: the run list and the run itself moved.
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
