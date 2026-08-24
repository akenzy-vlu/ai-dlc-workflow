import { Injectable } from '@nestjs/common';

import { Postgres } from '../../../shared/infrastructure/db/postgres';
import { AgentActivity, AgentTelemetry, emptyTelemetry } from '../domain/model/agent-activity';
import { AgentRun, LogLine, RunStatus } from '../domain/model/agent-run';
import { AgentRunStorePort } from '../domain/ports/agent.ports';

const MAX_PERSISTED_LINES = 4_000;
const MAX_PERSISTED_ACTIVITIES = 2_000;

interface Row {
  id: string;
  repository_id: string;
  repository_label: string;
  slug: string;
  ticket_id: string;
  agent_id: string;
  agent_label: string;
  launched_by: string;
  acting_as: string;
  cwd: string;
  command: string;
  prompt_preview: string;
  status: RunStatus;
  exit_code: number | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  log: LogLine[];
  activities: AgentActivity[];
  telemetry: AgentTelemetry;
}

/**
 * Agent run transcripts in Postgres.
 *
 * Live runs stay in memory exactly as the file store kept them, and only terminal runs are
 * written: a streaming run produces thousands of lines, and one round trip per line would
 * make the database the bottleneck in a transcript nobody reads until it finishes.
 *
 * The in-memory map is per-replica, so a run streaming on replica A is not visible on
 * replica B until it ends. That is the same limitation the file store had between two
 * processes, and the socket — not this store — is what the live view actually reads.
 */
@Injectable()
export class PgAgentRunStore implements AgentRunStorePort {
  private readonly memory = new Map<string, AgentRun>();

  constructor(private readonly db: Postgres) {}

  async save(run: AgentRun): Promise<void> {
    this.memory.set(run.id, run);
    if (!run.isTerminal) return;

    const log = [...run.log];
    await this.db.query(
      `INSERT INTO agent_run (
         id, repository_id, repository_label, slug, ticket_id, agent_id, agent_label,
         launched_by, acting_as, cwd, command, prompt_preview, status, exit_code,
         created_at, started_at, finished_at, log, activities, telemetry
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, exit_code = EXCLUDED.exit_code,
         started_at = EXCLUDED.started_at, finished_at = EXCLUDED.finished_at,
         log = EXCLUDED.log, activities = EXCLUDED.activities, telemetry = EXCLUDED.telemetry`,
      [
        run.id, run.repositoryId, run.repositoryLabel, run.slug, run.ticketId,
        run.agentId, run.agentLabel, run.launchedBy, run.actingAs, run.cwd,
        run.command, run.promptPreview, run.status, run.exitCode,
        run.createdAt, run.startedAt, run.finishedAt,
        // Keep the tail: the end of an agent transcript is where the failure is.
        JSON.stringify(log.length > MAX_PERSISTED_LINES ? log.slice(-MAX_PERSISTED_LINES) : log),
        JSON.stringify(run.activities.slice(-MAX_PERSISTED_ACTIVITIES)),
        JSON.stringify(run.telemetry),
      ],
    );
  }

  async find(id: string): Promise<AgentRun | null> {
    const live = this.memory.get(id);
    if (live) return live;
    const row = await this.db.one<Row>('SELECT * FROM agent_run WHERE id = $1', [id]);
    return row ? this.toDomain(row) : null;
  }

  async list(
    filter: { repositoryId?: string; slug?: string; ticketId?: string; active?: boolean } = {},
  ): Promise<AgentRun[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      where.push(clause.replace('?', `$${values.length}`));
    };
    if (filter.repositoryId) add('repository_id = ?', filter.repositoryId);
    if (filter.slug) add('slug = ?', filter.slug);
    if (filter.ticketId) add('ticket_id = ?', filter.ticketId);

    const rows = await this.db.query<Row>(
      `SELECT * FROM agent_run ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC`,
      values,
    );

    // Live runs are not in the table yet, so they are merged in rather than queried —
    // otherwise "active" would always come back empty, which is the one filter that
    // exists to show what is happening right now.
    const merged = new Map<string, AgentRun>();
    for (const row of rows) merged.set(row.id, this.toDomain(row));
    for (const run of this.memory.values()) merged.set(run.id, run);

    return [...merged.values()]
      .filter((run) => {
        if (filter.repositoryId && run.repositoryId !== filter.repositoryId) return false;
        if (filter.slug && run.slug !== filter.slug) return false;
        if (filter.ticketId && run.ticketId !== filter.ticketId) return false;
        if (filter.active !== undefined && run.isTerminal === filter.active) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private toDomain(row: Row): AgentRun {
    const run = AgentRun.create({
      id: row.id,
      repositoryId: row.repository_id,
      repositoryLabel: row.repository_label,
      slug: row.slug,
      ticketId: row.ticket_id,
      agentId: row.agent_id,
      agentLabel: row.agent_label,
      launchedBy: row.launched_by,
      actingAs: row.acting_as,
      cwd: row.cwd,
      command: row.command,
      promptPreview: row.prompt_preview,
      createdAt: row.created_at.toISOString(),
    });
    if (row.started_at) run.start(row.started_at.toISOString());
    for (const line of row.log ?? []) run.append(line);
    for (const activity of row.activities ?? []) run.observe(activity);
    // After the replay, so the restored counters win over the ones observe() rebuilt.
    run.restoreTelemetry(row.telemetry ?? emptyTelemetry());
    if (row.finished_at) {
      run.finish(row.exit_code ?? -1, row.finished_at.toISOString(), row.status === 'cancelled');
    }
    return run;
  }
}
