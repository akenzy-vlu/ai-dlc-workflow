import { Inject, Injectable } from '@nestjs/common';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import { AgentActivity, AgentTelemetry, emptyTelemetry } from '../domain/model/agent-activity';
import { AgentRun, LogLine, RunStatus } from '../domain/model/agent-run';
import { AgentRunStorePort } from '../domain/ports/agent.ports';

interface PersistedRun {
  id: string;
  repositoryId: string;
  repositoryLabel: string;
  slug: string;
  ticketId: string;
  agentId: string;
  agentLabel: string;
  launchedBy: string;
  actingAs: string;
  cwd: string;
  command: string;
  promptPreview: string;
  createdAt: string;
  /** Absent on every run written before replies existed, and absent means "not a reply". */
  parentRunId?: string | null;
  status: RunStatus;
  exitCode: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  log: LogLine[];
  activities?: AgentActivity[];
  telemetry?: AgentTelemetry;
}

const MAX_PERSISTED_LINES = 4_000;
const MAX_PERSISTED_ACTIVITIES = 2_000;

/**
 * Runs live in memory while they stream and are flushed to `~/.aidlc-console/runs/`.
 *
 * They are console state, not plan state, so they never touch the repository. The ticket
 * transition an agent caused *is* in the repo's audit trail — that is the durable record;
 * this is the transcript behind it.
 */
@Injectable()
export class FileAgentRunStore implements AgentRunStorePort {
  private readonly memory = new Map<string, AgentRun>();
  private readonly directory: string;
  private loaded = false;

  constructor(
    @Inject(AIDLC_CONFIG) config: AidlcConfig,
    private readonly fs: FileSystem,
  ) {
    this.directory = path.join(config.consoleHome, 'runs');
  }

  async save(run: AgentRun): Promise<void> {
    this.memory.set(run.id, run);
    // Only terminal runs hit disk: writing on every streamed line would mean thousands of
    // file writes per run for a transcript nobody reads until it is finished.
    if (run.isTerminal) {
      await this.fs.writeJson(path.join(this.directory, `${run.id}.json`), this.toPersistence(run));
    }
  }

  async find(id: string): Promise<AgentRun | null> {
    await this.hydrate();
    return this.memory.get(id) ?? null;
  }

  async list(filter: {
    repositoryId?: string;
    slug?: string;
    ticketId?: string;
    active?: boolean;
  } = {}): Promise<AgentRun[]> {
    await this.hydrate();
    return [...this.memory.values()]
      .filter((run) => {
        if (filter.repositoryId && run.repositoryId !== filter.repositoryId) return false;
        if (filter.slug && run.slug !== filter.slug) return false;
        if (filter.ticketId && run.ticketId !== filter.ticketId) return false;
        if (filter.active !== undefined && run.isTerminal === filter.active) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async hydrate(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    for (const name of await this.fs.listFiles(this.directory, '.json')) {
      const raw = await this.fs.readJson<PersistedRun>(path.join(this.directory, name));
      if (!raw || this.memory.has(raw.id)) continue;
      this.memory.set(raw.id, this.toDomain(raw));
    }
  }

  private toDomain(raw: PersistedRun): AgentRun {
    const run = AgentRun.create(raw);
    if (raw.startedAt) run.start(raw.startedAt);
    for (const line of raw.log ?? []) run.append(line);
    for (const activity of raw.activities ?? []) run.observe(activity);
    // After the replay, so the restored counters win over the ones observe() rebuilt.
    run.restoreTelemetry(raw.telemetry ?? emptyTelemetry());
    if (raw.finishedAt) run.finish(raw.exitCode ?? -1, raw.finishedAt, raw.status === 'cancelled');
    return run;
  }

  private toPersistence(run: AgentRun): PersistedRun {
    const log = [...run.log];
    return {
      id: run.id,
      repositoryId: run.repositoryId,
      repositoryLabel: run.repositoryLabel,
      slug: run.slug,
      ticketId: run.ticketId,
      agentId: run.agentId,
      agentLabel: run.agentLabel,
      launchedBy: run.launchedBy,
      actingAs: run.actingAs,
      cwd: run.cwd,
      command: run.command,
      promptPreview: run.promptPreview,
      createdAt: run.createdAt,
      parentRunId: run.parentRunId,
      status: run.status,
      exitCode: run.exitCode,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      // Keep the tail: the end of an agent transcript is where the failure is.
      log: log.length > MAX_PERSISTED_LINES ? log.slice(-MAX_PERSISTED_LINES) : log,
      // Activities are two orders of magnitude fewer than lines, and they are what makes
      // a finished run readable at all — keep more of them than of the raw transcript.
      activities: run.activities.slice(-MAX_PERSISTED_ACTIVITIES),
      telemetry: run.telemetry,
    };
  }
}
