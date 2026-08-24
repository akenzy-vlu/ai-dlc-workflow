import { useCallback, useEffect, useMemo } from 'react';

import {
  actorSet,
  themePreferenceSet,
  useAppDispatch,
  useAppSelector,
  viewDisplayPatched,
  viewFiltersSet,
  viewRegistered,
  viewReset,
  viewScopeSet,
} from '@app/store';
import type { PreferencesRepository, ThemePreference } from '@domain/repositories';
import type { DisplayOptions, ViewFilter } from '@domain/value-objects';

/**
 * Client preferences, backed by Redux and persisted through the local datasource.
 *
 * They live in the store rather than in component state so the sidebar, the header and a
 * dialog three levels down all read the same actor name without threading it through
 * props — and so a theme change repaints everything at once.
 */
export const preferencesRepository: PreferencesRepository = {
  useActor() {
    const dispatch = useAppDispatch();
    const actor = useAppSelector((state) => state.identity.actor);
    const setActor = useCallback((name: string) => dispatch(actorSet(name)), [dispatch]);
    return { actor, setActor };
  },

  useThemePreference() {
    const dispatch = useAppDispatch();
    const preference = useAppSelector((state) => state.theme.preference);
    const system = useAppSelector((state) => state.theme.system);
    const setPreference = useCallback(
      (next: ThemePreference) => dispatch(themePreferenceSet(next)),
      [dispatch],
    );
    return { preference, resolved: preference === 'system' ? system : preference, setPreference };
  },

  useViewState(viewKey, defaults) {
    const dispatch = useAppDispatch();
    const state = useAppSelector((store) => store.view.views[viewKey]);

    // Registering on mount seeds the slice from localStorage the first time a view is
    // opened. Doing it in an effect rather than at module load keeps the defaults with
    // the view that owns them instead of in a global table.
    useEffect(() => {
      dispatch(viewRegistered({ view: viewKey, defaults }));
      // `defaults` is a module-level constant at every call site; re-registering on a new
      // object identity would reset the user's filters on every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch, viewKey]);

    const filters = state?.filters ?? [];
    const display = state?.display ?? defaults.display;
    const scope = state?.scope ?? defaults.scope ?? 'all';

    const setFilters = useCallback(
      (next: ViewFilter[]) => dispatch(viewFiltersSet({ view: viewKey, filters: next })),
      [dispatch, viewKey],
    );
    const setDisplay = useCallback(
      (patch: Partial<DisplayOptions>) => dispatch(viewDisplayPatched({ view: viewKey, patch })),
      [dispatch, viewKey],
    );
    const setScope = useCallback(
      (next: string) => dispatch(viewScopeSet({ view: viewKey, scope: next })),
      [dispatch, viewKey],
    );
    const reset = useCallback(() => dispatch(viewReset(viewKey)), [dispatch, viewKey]);

    const isCustomised = useMemo(
      () =>
        filters.some((filter) => filter.values.length > 0) ||
        JSON.stringify(display) !== JSON.stringify(defaults.display),
      [filters, display, defaults.display],
    );

    return { filters, display, scope, setFilters, setDisplay, setScope, reset, isCustomised };
  },
};
