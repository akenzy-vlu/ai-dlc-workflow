import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { preferencesDatasource, type PersistedView } from '@data/datasource/local';
import type { DisplayOptions, ViewFilter } from '@domain/value-objects';

/**
 * Filters and display options, per view.
 *
 * Kept here rather than in the URL. A URL addresses a *thing* — a feature, a ticket — and
 * a link someone shares should open on the thing, not on the sender's private column
 * layout. What is remembered is how you like to look at a board; that belongs to you and
 * to this browser.
 */
interface ViewState {
  views: Record<string, PersistedView>;
  defaults: Record<string, PersistedView>;
}

const initialState: ViewState = { views: {}, defaults: {} };

export const viewSlice = createSlice({
  name: 'view',
  initialState,
  reducers: {
    /** Loads a view's persisted state on first mount, or seeds it from the defaults. */
    viewRegistered(
      state,
      action: PayloadAction<{ view: string; defaults: { display: DisplayOptions; scope?: string } }>,
    ) {
      const { view, defaults } = action.payload;
      const seed: PersistedView = {
        filters: [],
        display: defaults.display,
        scope: defaults.scope ?? 'all',
      };
      state.defaults[view] = seed;
      if (!state.views[view]) state.views[view] = preferencesDatasource.readView(view, seed);
    },
    viewFiltersSet(state, action: PayloadAction<{ view: string; filters: ViewFilter[] }>) {
      const current = state.views[action.payload.view];
      if (!current) return;
      current.filters = action.payload.filters;
      preferencesDatasource.writeView(action.payload.view, current);
    },
    viewDisplayPatched(
      state,
      action: PayloadAction<{ view: string; patch: Partial<DisplayOptions> }>,
    ) {
      const current = state.views[action.payload.view];
      if (!current) return;
      current.display = { ...current.display, ...action.payload.patch };
      preferencesDatasource.writeView(action.payload.view, current);
    },
    viewScopeSet(state, action: PayloadAction<{ view: string; scope: string }>) {
      const current = state.views[action.payload.view];
      if (!current) return;
      current.scope = action.payload.scope;
      preferencesDatasource.writeView(action.payload.view, current);
    },
    viewReset(state, action: PayloadAction<string>) {
      const seed = state.defaults[action.payload];
      if (!seed) return;
      state.views[action.payload] = { ...seed, filters: [] };
      preferencesDatasource.writeView(action.payload, state.views[action.payload]);
    },
  },
});

export const { viewRegistered, viewFiltersSet, viewDisplayPatched, viewScopeSet, viewReset } =
  viewSlice.actions;
export const viewReducer = viewSlice.reducer;
