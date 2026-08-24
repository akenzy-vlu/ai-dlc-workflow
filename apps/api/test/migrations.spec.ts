import { describe, expect, it } from 'vitest';

import { MIGRATIONS } from '../src/shared/infrastructure/db/migrations';

/**
 * Cheap guards on the schema list. Each one is a mistake that costs a container that
 * boots, fails its migration, and is reported only as "unhealthy".
 */
describe('migrations', () => {
  it('has unique ids — the applied-set is keyed by them', () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains no backticks: the SQL lives in a template literal', () => {
    // A backtick in a SQL comment terminates the literal, and the resulting error is a
    // TypeScript parse failure a hundred lines away from the character that caused it.
    for (const migration of MIGRATIONS) {
      expect(migration.sql, `${migration.id} has a backtick`).not.toContain('`');
    }
  });

  it('never names a column with a Postgres reserved word', () => {
    // `binary` cost one failed boot to find. These are the ones plausible in this schema.
    const RESERVED = ['binary', 'user', 'order', 'default', 'check', 'table', 'column'];
    for (const migration of MIGRATIONS) {
      for (const word of RESERVED) {
        const declaration = new RegExp(`^\\s+${word}\\s+(TEXT|JSONB|INTEGER|BIGINT|TIMESTAMPTZ)`, 'im');
        expect(declaration.test(migration.sql), `${migration.id} declares a ${word} column`).toBe(false);
      }
    }
  });

  it('is idempotent to re-run: every object is created IF NOT EXISTS', () => {
    // The migrator skips applied ids, but a partially-applied step gets retried on the
    // next boot and must not fail on the objects it already made.
    for (const migration of MIGRATIONS) {
      const creates = migration.sql.match(/CREATE (TABLE|INDEX)(?! IF NOT EXISTS)/gi) ?? [];
      expect(creates, `${migration.id} has a CREATE without IF NOT EXISTS`).toEqual([]);
    }
  });
});
