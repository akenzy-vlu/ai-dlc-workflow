import { Injectable } from '@nestjs/common';

import { Postgres } from '../infrastructure/db/postgres';
import type { ConsoleSettings, ConsoleSettingsPort } from './console-settings.port';

/**
 * Settings as key/value rows.
 *
 * A row per key rather than one blob, so two replicas patching different keys at the same
 * time do not overwrite each other — a read-modify-write of a single document loses
 * whichever write lands first.
 */
@Injectable()
export class PgConsoleSettings implements ConsoleSettingsPort {
  constructor(private readonly db: Postgres) {}

  async read(): Promise<ConsoleSettings> {
    const rows = await this.db.query<{ key: string; value: unknown }>(
      'SELECT key, value FROM console_setting',
    );
    return Object.fromEntries(rows.map((row) => [row.key, row.value])) as ConsoleSettings;
  }

  async patch(values: Partial<ConsoleSettings>): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;
      await this.db.query(
        `INSERT INTO console_setting (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(value)],
      );
    }
  }
}
