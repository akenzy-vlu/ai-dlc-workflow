import type { ThemePreference } from '@domain/repositories';
import type { DisplayOptions, ViewFilter } from '@domain/value-objects';
import { STORAGE_KEYS, viewKey } from '../../database/keys';
import { localDatabase } from '../../database/local-database';

export interface PersistedView {
  filters: ViewFilter[];
  display: DisplayOptions;
  scope: string;
}

/**
 * Reads and writes what this browser remembers.
 *
 * The actor name is stored as a bare string rather than JSON so a person can look at it
 * in devtools and recognise it — it is, after all, their name, and it ends up in an
 * append-only trail inside a repository.
 */
export const preferencesDatasource = {
  readActor: (): string => localDatabase.readRaw(STORAGE_KEYS.actor),
  writeActor: (name: string): void => localDatabase.writeRaw(STORAGE_KEYS.actor, name.trim()),

  readTheme: (): ThemePreference => {
    const stored = localDatabase.readRaw(STORAGE_KEYS.theme);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  },
  writeTheme: (preference: ThemePreference): void => {
    if (preference === 'system') localDatabase.remove(STORAGE_KEYS.theme);
    else localDatabase.writeRaw(STORAGE_KEYS.theme, preference);
  },

  readView: (view: string, defaults: PersistedView): PersistedView => {
    const stored = localDatabase.read<Partial<PersistedView> | null>(viewKey(view), null);
    if (!stored) return defaults;
    return {
      filters: Array.isArray(stored.filters) ? stored.filters : defaults.filters,
      // Merged rather than replaced, so a display option added later gets its default
      // instead of arriving as `undefined` in every browser that used the old shape.
      display: { ...defaults.display, ...(stored.display ?? {}) },
      scope: stored.scope ?? defaults.scope,
    };
  },
  writeView: (view: string, value: PersistedView): void => localDatabase.write(viewKey(view), value),
};
