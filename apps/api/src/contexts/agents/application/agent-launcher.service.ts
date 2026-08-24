import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

import { TicketId } from '../../../shared/kernel';
import { TicketOperations } from '../../construction/application/ticket-operations.use-case';
import { FeatureSnapshotAssembler } from '../../insight/application/feature-snapshot.assembler';
import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import { AgentActivity } from '../domain/model/agent-activity';
import { AgentRun, LogLine } from '../domain/model/agent-run';
import {
  AGENT_CATALOG,
  AGENT_PROCESS,
  AGENT_RUN_STORE,
  AgentCatalogPort,
  AgentProcessPort,
  AgentRunStorePort,
} from '../domain/ports/agent.ports';
import { TicketBriefingBuilder } from './ticket-briefing.builder';

export interface LaunchAgentInput {
  repositoryId: string;
  slug: string;
  ticketId: string;
  agentId: string;
  launchedBy: string;
  /** Appended to the generated brief. Where a human adds what the plan does not say. */
  extraInstructions?: string;
  /** Minutes. Bounded so a hung CLI does not sit on the machine forever. */
  timeoutMinutes?: number;
  /**
   * The caller states plainly that it understands this writes code in a real checkout.
   * The console refuses without it — a launch button that fires on one click is how an
   * agent ends up rewriting a repository nobody meant to point it at.
   */
  acknowledged: boolean;
}

/**
 * `line` carries transcript output, `activity` carries a structured step. Both null means
 * a lifecycle change — started, finished, cancelled — and that is the only case a client
 * needs to refetch anything on.
 */
export type RunEventListener = (run: AgentRun, line: LogLine | null, activity?: AgentActivity | null) => void;

const DEFAULT_TIMEOUT_MINUTES = 30;
const MAX_TIMEOUT_MINUTES = 180;

@Injectable()
export class AgentLauncherService {
  private readonly logger = new Logger(AgentLauncherService.name);
  private readonly listeners = new Set<RunEventListener>();

  constructor(
    @Inject(AGENT_CATALOG) private readonly catalog: AgentCatalogPort,
    @Inject(AGENT_PROCESS) private readonly processes: AgentProcessPort,
    @Inject(AGENT_RUN_STORE) private readonly store: AgentRunStorePort,
    private readonly repositories: RepositoryMaintenance,
    private readonly assembler: FeatureSnapshotAssembler,
    private readonly tickets: TicketOperations,
    private readonly briefings: TicketBriefingBuilder,
  ) {}

  onEvent(listener: RunEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async listAgents() {
    return (await this.catalog.list()).map((a) => ({
      id: a.id,
      label: a.label,
      binary: a.binary,
      available: a.available,
      resolvedPath: a.resolvedPath,
      promptVia: a.promptVia,
    }));
  }

  async listRuns(filter: { repositoryId?: string; slug?: string; ticketId?: string; active?: boolean } = {}) {
    return (await this.store.list(filter)).map((run) => this.summarise(run));
  }

  async getRun(id: string) {
    const run = await this.store.find(id);
    if (!run) throw new NotFoundException(`no such run: ${id}`);
    return { ...this.summarise(run), log: run.log, activities: run.activities };
  }

  /** Preview the brief without launching. Reading it before a run is the cheap check. */
  async previewBriefing(repositoryId: string, slug: string, ticketId: string): Promise<string> {
    const { snapshot, ticket } = await this.resolve(repositoryId, slug, ticketId);
    return this.briefings.build(snapshot, ticket);
  }

  /**
   * Moves the ticket to `in_progress` through the controller, then launches the agent.
   *
   * The order is not incidental. If the controller refuses — the feature is below G3, a
   * dependency is not done — nothing spawns. An agent is subject to the same gates as a
   * person, which is the only reading of "agents as teammates" that does not quietly
   * route around the method.
   */
  async launch(input: LaunchAgentInput): Promise<{ runId: string }> {
    if (!input.acknowledged) {
      throw new BadRequestException(
        'refused: this runs an agent CLI that writes files in a real checkout — the caller must acknowledge it',
      );
    }
    if (!input.launchedBy.trim()) {
      throw new BadRequestException('`launchedBy` is required — a run is attributed to a person');
    }

    const definition = await this.catalog.find(input.agentId);
    if (!definition) throw new NotFoundException(`unknown agent: ${input.agentId}`);
    if (!definition.available) {
      throw new BadRequestException(
        `${definition.label} is not installed on this machine — the console drives agent CLIs, it does not ship them`,
      );
    }

    const active = await this.store.list({ ticketId: input.ticketId, active: true });
    if (active.some((r) => r.slug === input.slug && r.repositoryId === input.repositoryId)) {
      throw new ConflictException(`${input.ticketId} already has an agent working on it`);
    }

    const { snapshot, ticket, repository } = await this.resolve(input.repositoryId, input.slug, input.ticketId);

    if (ticket.status.isDone) {
      throw new ConflictException(`${input.ticketId} is already done`);
    }

    const actingAs = `${definition.label} (via ${input.launchedBy.trim()})`;

    // The controller decides whether this ticket may start at all.
    if (ticket.status.value === 'todo') {
      const outcome = await this.tickets.transition({
        repositoryId: input.repositoryId,
        slug: input.slug,
        ticketId: input.ticketId,
        action: 'start',
        by: actingAs,
      });
      if (!outcome.accepted) {
        throw new ConflictException(outcome.output || 'the controller refused to start this ticket');
      }
    }

    const brief = await this.briefings.build(snapshot, ticket);
    const prompt = input.extraInstructions?.trim()
      ? `${brief}\n\n## Additional instructions from ${input.launchedBy.trim()}\n\n${input.extraInstructions.trim()}`
      : brief;

    const run = AgentRun.create({
      id: randomUUID(),
      repositoryId: input.repositoryId,
      repositoryLabel: repository.label,
      slug: input.slug,
      ticketId: input.ticketId,
      agentId: definition.id,
      agentLabel: definition.label,
      launchedBy: input.launchedBy.trim(),
      actingAs,
      cwd: repository.absolutePath,
      command: `${definition.binary} ${definition.argsFor('<prompt>').join(' ')}`,
      promptPreview: prompt,
      createdAt: new Date().toISOString(),
    });

    await this.store.save(run);
    void this.execute(run, definition, prompt, input.timeoutMinutes);
    return { runId: run.id };
  }

  async cancel(runId: string): Promise<{ cancelled: boolean }> {
    const run = await this.store.find(runId);
    if (!run) throw new NotFoundException(`no such run: ${runId}`);
    return { cancelled: this.processes.cancel(runId) };
  }

  private async execute(
    run: AgentRun,
    definition: Awaited<ReturnType<AgentCatalogPort['find']>> & object,
    prompt: string,
    timeoutMinutes?: number,
  ): Promise<void> {
    const minutes = Math.min(Math.max(timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES, 1), MAX_TIMEOUT_MINUTES);
    run.start(new Date().toISOString());
    this.emit(run, null);
    await this.store.save(run);

    try {
      const result = await this.processes.launch({
        run,
        definition,
        prompt,
        timeoutMs: minutes * 60_000,
        onLine: (line) => {
          run.append(line);
          this.emit(run, line);
        },
        onActivity: (activity: AgentActivity) => {
          run.observe(activity);
          this.emit(run, null, activity);
        },
        onTelemetry: (patch) => run.mergeTelemetry(patch),
      });
      run.finish(result.exitCode, new Date().toISOString(), result.cancelled);
    } catch (error) {
      run.append({
        at: new Date().toISOString(),
        stream: 'console',
        text: `— the console could not run it: ${(error as Error).message}`,
      });
      run.finish(-1, new Date().toISOString());
    }

    await this.store.save(run);
    // The agent almost certainly changed files; the plan's checklists may have moved with them.
    this.assembler.invalidate(run.repositoryId, run.slug);

    // The briefing tells the agent not to move the ticket because "the console moves it for
    // you". This is where the console keeps that promise — without it the agent obeys, the
    // console does nothing, and the ticket is stranded in `in_progress` after a clean run.
    await this.handOff(run);

    await this.store.save(run);
    this.emit(run, null);
    this.logger.log(`run ${run.id} finished: ${run.status} (exit ${run.exitCode})`);
  }

  /**
   * Asks the controller to move a finished ticket to review.
   *
   * Only after a clean run: a failed or cancelled agent has nothing to hand to a reviewer,
   * and submitting it would put unfinished work in someone's queue.
   *
   * The controller still decides. It refuses while any done-when box is unticked, and that
   * refusal is the honest outcome — the ticket stays `in_progress` and the reason goes into
   * the transcript rather than being swallowed. Note what this deliberately does *not* do:
   * `accept`. Moving to `done` is a person's judgement, and an agent accepting its own work
   * is the single failure this method exists to prevent.
   */
  private async handOff(run: AgentRun): Promise<void> {
    if (run.status !== 'succeeded') return;

    try {
      const outcome = await this.tickets.transition({
        repositoryId: run.repositoryId,
        slug: run.slug,
        ticketId: run.ticketId,
        action: 'submit',
        by: run.actingAs,
      });

      run.append({
        at: new Date().toISOString(),
        stream: 'console',
        text: outcome.accepted
          ? `— ${run.ticketId} submitted for review`
          : `— ${run.ticketId} stays in progress: ${outcome.output.trim() || 'the controller refused to submit it'}`,
      });
      this.assembler.invalidate(run.repositoryId, run.slug);
    } catch (error) {
      // A hand-off that cannot run must not lose the transcript of work that did.
      run.append({
        at: new Date().toISOString(),
        stream: 'console',
        text: `— could not submit ${run.ticketId}: ${(error as Error).message}`,
      });
    }
  }

  private emit(run: AgentRun, line: LogLine | null, activity: AgentActivity | null = null): void {
    for (const listener of this.listeners) listener(run, line, activity);
  }

  private summarise(run: AgentRun) {
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
      status: run.status,
      exitCode: run.exitCode,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      command: run.command,
      cwd: run.cwd,
      lineCount: run.log.length,
      suggestsSubmit: run.suggestsSubmit,
      currentActivity: run.currentActivity,
      activityCount: run.activities.length,
      telemetry: run.telemetry,
      isResumable: run.isResumable,
    };
  }

  private async resolve(repositoryId: string, slug: string, ticketId: string) {
    const repository = await this.repositories.require(repositoryId);
    const snapshot = await this.assembler.assembleById(repositoryId, slug);
    if (!snapshot) throw new NotFoundException(`feature not found: ${repositoryId}/${slug}`);

    const id = TicketId.tryCreate(ticketId);
    const ticket = id ? snapshot.construction.tickets.find((t) => t.id.equals(id)) : undefined;
    if (!ticket) throw new NotFoundException(`no ticket ${ticketId} in ${repositoryId}/${slug}`);

    return { repository, snapshot, ticket, featureDirectory: path.join(repository.featuresDirectory, slug) };
  }
}
