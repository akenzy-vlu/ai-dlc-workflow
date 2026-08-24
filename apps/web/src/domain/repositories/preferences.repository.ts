import type { DisplayOptions, ViewFilter } from '../value-objects';

export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * What this browser remembers about the person using it.
 *
 * None of it is domain data and none of it leaves the machine. The actor name is the
 * exception worth naming: it is local, but it ends up in an append-only trail inside a
 * repository, so it is never defaulted to a hostname or to "console".
 */
export interface PreferencesRepository {
  useActor(): { actor: string; setActor: (name: string) => void };
  useThemePreference(): {
    preference: ThemePreference;
    resolved: 'light' | 'dark';
    setPreference: (preference: ThemePreference) => void;
  };
  useViewState(
    viewKey: string,
    defaults: { display: DisplayOptions; scope?: string },
  ): {
    filters: ViewFilter[];
    display: DisplayOptions;
    scope: string;
    setFilters: (filters: ViewFilter[]) => void;
    setDisplay: (patch: Partial<DisplayOptions>) => void;
    setScope: (scope: string) => void;
    reset: () => void;
    isCustomised: boolean;
  };
}
