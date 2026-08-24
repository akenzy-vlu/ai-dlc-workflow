/**
 * Schema, as an ordered list of immutable steps.
 *
 * Inline SQL rather than `.sql` files on purpose: `nest build` compiles TypeScript and
 * copies nothing else, so a migrations directory would exist in the repo and be missing
 * from `dist/` — the failure landing at boot in the container and nowhere else.
 *
 * Never edit a shipped step. Append a new one; `id` is the applied-set key.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001-console-state',
    sql: `
      -- Which checkouts the console watches. The one aggregate it owns.
      CREATE TABLE IF NOT EXISTS tracked_repository (
        id                TEXT PRIMARY KEY,
        label             TEXT        NOT NULL,
        absolute_path     TEXT        NOT NULL UNIQUE,
        added_at          TIMESTAMPTZ NOT NULL,
        last_scanned_at   TIMESTAMPTZ,
        project_override  TEXT,
        -- settings and git metadata are read wholesale and never queried by field, so
        -- they stay documents rather than becoming eleven columns that all change
        -- together whenever .ai/aidlc.yaml grows a key.
        settings          JSONB       NOT NULL DEFAULT '{}'::jsonb,
        git               JSONB
      );

      -- Single-row console preferences (the resolved runner python, today).
      CREATE TABLE IF NOT EXISTS console_setting (
        key    TEXT PRIMARY KEY,
        value  JSONB NOT NULL
      );

      -- Custom agent CLI definitions. Built-ins are code; these are the additions.
      CREATE TABLE IF NOT EXISTS agent_definition (
        id           TEXT PRIMARY KEY,
        label        TEXT  NOT NULL,
        -- named binary_name, not binary: the latter is reserved in Postgres and every
        -- reference to it would need quoting for the life of the schema. Backticks are
        -- also banned in here -- this SQL lives in a template literal.
        binary_name  TEXT  NOT NULL,
        args         JSONB NOT NULL DEFAULT '[]'::jsonb,
        prompt_via   TEXT  NOT NULL DEFAULT 'stdin'
      );

      -- Agent run transcripts. Console state, not plan state: the ticket transition an
      -- agent caused lives in the repo's own audit trail, and this is the transcript
      -- behind it.
      CREATE TABLE IF NOT EXISTS agent_run (
        id               TEXT PRIMARY KEY,
        repository_id    TEXT        NOT NULL,
        repository_label TEXT        NOT NULL,
        slug             TEXT        NOT NULL,
        ticket_id        TEXT        NOT NULL,
        agent_id         TEXT        NOT NULL,
        agent_label      TEXT        NOT NULL,
        launched_by      TEXT        NOT NULL,
        acting_as        TEXT        NOT NULL,
        cwd              TEXT        NOT NULL,
        command          TEXT        NOT NULL,
        prompt_preview   TEXT        NOT NULL,
        status           TEXT        NOT NULL,
        exit_code        INTEGER,
        created_at       TIMESTAMPTZ NOT NULL,
        started_at       TIMESTAMPTZ,
        finished_at      TIMESTAMPTZ,
        log              JSONB       NOT NULL DEFAULT '[]'::jsonb,
        activities       JSONB       NOT NULL DEFAULT '[]'::jsonb,
        telemetry        JSONB       NOT NULL DEFAULT '{}'::jsonb
      );

      -- The agent-runs page filters on exactly these, newest first.
      CREATE INDEX IF NOT EXISTS agent_run_created_idx ON agent_run (created_at DESC);
      CREATE INDEX IF NOT EXISTS agent_run_scope_idx   ON agent_run (repository_id, slug, ticket_id);

      -- Evidence blob metadata. The bytes are in MinIO; this is what makes "how much is
      -- held?" a query instead of a full bucket listing.
      CREATE TABLE IF NOT EXISTS evidence_blob (
        sha256       TEXT PRIMARY KEY,
        bytes        BIGINT      NOT NULL,
        content_type TEXT        NOT NULL,
        stored_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
  {
    id: '002-drop-agent-definition',
    sql: `
      -- Agent definitions are configuration a person hand-edits, not state the console
      -- owns: nothing ever wrote this table, and putting it here silently orphaned the
      -- agents.json people already had. They are read from the file in both drivers now.
      DROP TABLE IF EXISTS agent_definition;
    `,
  },
];
