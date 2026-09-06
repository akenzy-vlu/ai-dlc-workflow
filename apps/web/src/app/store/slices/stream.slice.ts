import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AgentActivity, AgentLogLine } from '@domain/entities';
import type { SetupStepId } from '@domain/enums';

export interface SetupLogLine {
  step: string;
  state: 'running' | 'done' | 'failed';
  line: string;
  at: string;
}

/**
 * Output that arrives over the socket, line by line.
 *
 * Kept out of RTK Query on purpose. Query caches are for *fetched* state that a server
 * can be asked for again; an agent transcript is a stream that exists only as it happens,
 * and pushing each line through a cache update would refetch nothing and invalidate
 * everything hundreds of times per run.
 */
interface StreamState {
  /** Lines received since this session subscribed, per run id. */
  agentLog: Record<string, AgentLogLine[]>;
  /**
   * What each run is doing right now, per run id — undefined means "nothing received
   * yet, trust the fetched snapshot"; null means the socket itself said there is nothing
   * current, which a fetched snapshot can go stale on the moment a run finishes.
   */
  agentActivity: Record<string, AgentActivity | null>;
  setupLog: SetupLogLine[];
  setupSteps: Partial<Record<SetupStepId, 'running' | 'done' | 'failed'>>;
  gateSweep: { done: number; total: number } | null;
}

const initialState: StreamState = {
  agentLog: {},
  agentActivity: {},
  setupLog: [],
  setupSteps: {},
  gateSweep: null,
};

/** A very long run should not grow the store without bound; the tail is what matters. */
const MAX_LINES = 5_000;

export const streamSlice = createSlice({
  name: 'stream',
  initialState,
  reducers: {
    agentLineReceived(state, action: PayloadAction<{ runId: string; line: AgentLogLine }>) {
      const { runId, line } = action.payload;
      const lines = state.agentLog[runId] ?? [];
      lines.push(line);
      state.agentLog[runId] = lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines;
    },
    agentLogCleared(state, action: PayloadAction<string>) {
      delete state.agentLog[action.payload];
    },
    /**
     * The activity a status/lifecycle frame carried — null included, deliberately. A run
     * that just finished reports activity: null, and that null is what makes the
     * "currently doing" line disappear without a refetch.
     */
    agentActivityReceived(state, action: PayloadAction<{ runId: string; activity: AgentActivity | null }>) {
      state.agentActivity[action.payload.runId] = action.payload.activity;
    },
    agentActivityCleared(state, action: PayloadAction<string>) {
      delete state.agentActivity[action.payload];
    },
    setupProgressReceived(
      state,
      action: PayloadAction<{ step: string; state: 'running' | 'done' | 'failed'; line: string | null; at: string }>,
    ) {
      const { step, state: stepState, line, at } = action.payload;
      state.setupSteps[step as SetupStepId] = stepState;
      if (line !== null) state.setupLog.push({ step, state: stepState, line, at });
    },
    setupLogCleared(state) {
      state.setupLog = [];
      state.setupSteps = {};
    },
    gateSweepProgress(state, action: PayloadAction<{ done: number; total: number } | null>) {
      state.gateSweep =
        action.payload && action.payload.done < action.payload.total ? action.payload : null;
    },
  },
});

export const {
  agentLineReceived,
  agentLogCleared,
  agentActivityReceived,
  agentActivityCleared,
  setupProgressReceived,
  setupLogCleared,
  gateSweepProgress,
} = streamSlice.actions;
export const streamReducer = streamSlice.reducer;
