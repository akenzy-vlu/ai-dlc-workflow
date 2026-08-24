import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { preferencesDatasource } from '@data/datasource/local';

interface IdentityState {
  /**
   * Who is acting.
   *
   * Every write in AI-DLC carries `--by <name>`, and on repositories that do not commit
   * `.ai/` that string is the only durable record that a person approved anything. It is
   * deliberately not defaulted to the hostname or to "console" — a plausible-looking
   * default is a fake signature on a real approval.
   */
  actor: string;
}

const initialState: IdentityState = { actor: preferencesDatasource.readActor() };

export const identitySlice = createSlice({
  name: 'identity',
  initialState,
  reducers: {
    actorSet(state, action: PayloadAction<string>) {
      state.actor = action.payload.trim();
      preferencesDatasource.writeActor(state.actor);
    },
  },
});

export const { actorSet } = identitySlice.actions;
export const identityReducer = identitySlice.reducer;
