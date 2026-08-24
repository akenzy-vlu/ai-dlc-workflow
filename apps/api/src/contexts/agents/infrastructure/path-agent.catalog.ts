import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  AGENT_DEFINITION_SOURCE,
  type AgentConfigEntry,
  type AgentDefinitionSourcePort,
} from '../domain/ports/agent-definition-source.port';
import { ProcessRunner } from '../../../shared/infrastructure/process/process-runner';
import { AgentDefinition } from '../domain/model/agent-definition';
import { AgentCatalogPort } from '../domain/ports/agent.ports';

/**
 * A small built-in table, plus whatever the deployment declares through
 * `AgentDefinitionSourcePort` — `agents.json` on a laptop, a table in Postgres otherwise.
 *
 * Deliberately short. Multica drives twenty-three CLIs; guessing the non-interactive
 * invocation for twenty-three tools would mean shipping flags that are wrong for most of
 * them, and a wrong flag here does not error — it opens an interactive session that hangs
 * forever behind a pipe. Four entries verified by hand, and a config file for the rest.
 */
const BUILT_IN: AgentConfigEntry[] = [
  // `-p` is print mode: run once, write to stdout, exit. Without it the CLI is a REPL.
  { id: 'claude', label: 'Claude Code', binary: 'claude', args: ['-p'], promptVia: 'stdin' },
  { id: 'codex', label: 'OpenAI Codex', binary: 'codex', args: ['exec', '{{prompt}}'], promptVia: 'arg' },
  { id: 'cursor-agent', label: 'Cursor Agent', binary: 'cursor-agent', args: ['-p'], promptVia: 'stdin' },
  { id: 'copilot', label: 'GitHub Copilot CLI', binary: 'copilot', args: ['-p', '{{prompt}}'], promptVia: 'arg' },
];

@Injectable()
export class PathAgentCatalog implements AgentCatalogPort {
  private readonly logger = new Logger(PathAgentCatalog.name);
  private cache: AgentDefinition[] | null = null;

  constructor(
    private readonly runner: ProcessRunner,
    @Inject(AGENT_DEFINITION_SOURCE) private readonly source: AgentDefinitionSourcePort,
  ) {}

  async list(): Promise<AgentDefinition[]> {
    if (this.cache) return this.cache;

    const overrides = await this.source.list();

    // A user entry with the same id replaces the built-in rather than duplicating it.
    const merged = new Map<string, AgentConfigEntry>();
    for (const entry of [...BUILT_IN, ...overrides]) {
      if (entry?.id && entry?.binary) merged.set(entry.id, entry);
    }

    this.cache = await Promise.all(
      [...merged.values()].map(async (entry) => {
        const resolved = await this.which(entry.binary);
        return AgentDefinition.create({
          id: entry.id,
          label: entry.label ?? entry.id,
          binary: entry.binary,
          args: entry.args ?? [],
          promptVia: entry.promptVia ?? 'stdin',
          available: resolved !== null,
          resolvedPath: resolved,
        });
      }),
    );

    const available = this.cache.filter((a) => a.available).map((a) => a.id);
    this.logger.log(`agent CLIs available: ${available.length ? available.join(', ') : 'none'}`);
    return this.cache;
  }

  async find(id: string): Promise<AgentDefinition | null> {
    return (await this.list()).find((a) => a.id === id) ?? null;
  }

  refresh(): void {
    this.cache = null;
  }

  private async which(binary: string): Promise<string | null> {
    const result = await this.runner.run('which', [binary], { timeoutMs: 5_000 }).catch(() => null);
    return result && result.code === 0 ? result.stdout.trim() : null;
  }
}
