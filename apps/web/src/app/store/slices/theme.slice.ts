import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { preferencesDatasource } from '@data/datasource/local';
import type { ThemePreference } from '@domain/repositories';

interface ThemeState {
  preference: ThemePreference;
  /** What the OS currently reports, tracked so `system` can resolve without a re-read. */
  system: 'light' | 'dark';
}

const initialState: ThemeState = {
  preference: preferencesDatasource.readTheme(),
  system:
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
};

export const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    themePreferenceSet(state, action: PayloadAction<ThemePreference>) {
      state.preference = action.payload;
      preferencesDatasource.writeTheme(action.payload);
    },
    systemThemeChanged(state, action: PayloadAction<'light' | 'dark'>) {
      state.system = action.payload;
    },
  },
});

export const { themePreferenceSet, systemThemeChanged } = themeSlice.actions;
export const themeReducer = themeSlice.reducer;
