import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AgentLogLine } from '@domain/entities';
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
  setupLog: SetupLogLine[];
  setupSteps: Partial<Record<SetupStepId, 'running' | 'done' | 'failed'>>;
  gateSweep: { done: number; total: number } | null;
}

const initialState: StreamState = { agentLog: {}, setupLog: [], setupSteps: {}, gateSweep: null };

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
  setupProgressReceived,
  setupLogCleared,
  gateSweepProgress,
} = streamSlice.actions;
export const streamReducer = streamSlice.reducer;
