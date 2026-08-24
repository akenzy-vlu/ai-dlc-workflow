import { useDispatch, useSelector, useStore } from 'react-redux';

import type { AppDispatch, RootState } from './store';

/** Typed wrappers so no component ever writes `useSelector((s: RootState) => …)`. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<typeof import('./store').store>();
