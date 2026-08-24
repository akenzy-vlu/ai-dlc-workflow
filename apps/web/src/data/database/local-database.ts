/**
 * A tiny typed store over `localStorage`.
 *
 * Called a database because that is what it is for this app: the one place anything is
 * persisted on the client. It is small on purpose — everything the console *knows* comes
 * from the API, and everything here is what this browser remembers about the person
 * using it. Nothing domain-shaped is ever written here, because a second copy of plan
 * data would immediately start drifting from the files.
 *
 * Every access is guarded: private mode and disabled site data both throw on the first
 * read, and a preference failing to persist must never take a page down with it.
 */
export class LocalDatabase {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  /** Reads a value stored as a bare string rather than JSON. */
  readRaw(key: string, fallback = ''): string {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  write<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode: the value simply does not persist */
    }
  }

  writeRaw(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* private mode */
    }
  }
}

export const localDatabase = new LocalDatabase();
