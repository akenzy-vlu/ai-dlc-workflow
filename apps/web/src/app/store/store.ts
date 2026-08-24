import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

import { consoleApi } from '@data/datasource/remote';
import { rootReducer } from './root-reducer';

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefault) => getDefault().concat(consoleApi.middleware),
  devTools: import.meta.env.DEV,
});

// Enables `refetchOnReconnect`. Focus refetching stays off — the server pushes.
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
