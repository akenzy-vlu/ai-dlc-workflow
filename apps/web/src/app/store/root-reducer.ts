import { combineReducers } from '@reduxjs/toolkit';

import { consoleApi } from '@data/datasource/remote';
import { identityReducer } from './slices/identity.slice';
import { streamReducer } from './slices/stream.slice';
import { themeReducer } from './slices/theme.slice';
import { viewReducer } from './slices/view.slice';

export const rootReducer = combineReducers({
  [consoleApi.reducerPath]: consoleApi.reducer,
  identity: identityReducer,
  theme: themeReducer,
  view: viewReducer,
  stream: streamReducer,
});
