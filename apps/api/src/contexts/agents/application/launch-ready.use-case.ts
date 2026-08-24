import { Injectable, Logger } from '@nestjs/common';

import { FeatureSnapshotAssembler } from '../../insight/application/feature-snapshot.assembler';
import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import type { Ticket } from '../../construction/domain/model/ticket';
import { AgentLauncherService } from './agent-launcher.service';

export interface LaunchReadyInput {
  repositoryId: string;
  slug: string;
  agentId: string;
  launchedBy: string;
  extraInstructions?: string;
  timeoutMinutes?: number;
  /**
   * Same gate the single launch has, and it matters more here: this starts N agents
   * writing in a real checkout from one click.
   */
  acknowledged: boolean;
}

export interface LaunchReadyResult {
  launched: { ticketId: string; runId: string }[];
  skipped: { ticketId: string; reason: string }[];
}

/**
 * Hands every pickable ticket in a feature to an agent at once.
 *
 * "Pickable" is narrower than it looks, and the narrowing is the whole value:
 *
 * - dependencies must be met, or the controller refuses the start anyway;
 * - a ticket already being worked on is left alone, rather than given a second agent;
 * - and any ticket that would write a file another launched ticket also writes is held
 *   back. `TicketGraph.writeConflicts()` exists for precisely this — two tickets with no
 *   ordering between them can be in flight together, and then one of them loses its work.
 *   Launching them concurrently is how a plan quietly destroys its own output.
 *
 * It stops at `review`, like every other launch. Nothing here accepts.
 */
@Injectable()
export class LaunchReadyTickets {
  private readonly logger = new Logger(LaunchReadyTickets.name);

  constructor(
    private readonly repositories: RepositoryMaintenance,
    private readonly assembler: FeatureSnapshotAssembler,
    private readonly launcher: AgentLauncherService,
  ) {}

  async execute(input: LaunchReadyInput): Promise<LaunchReadyResult> {
    const repository = await this.repositories.require(input.repositoryId);
    const snapshot = await this.assembler.assemble(repository, input.slug);
    const graph = snapshot.construction.graph;

    const candidates = snapshot.construction.tickets.filter(
      (ticket) =>
        !ticket.status.isDone &&
        ticket.status.value !== 'blocked' &&
        graph.unmetDependencyCount(ticket) === 0,
    );

    const skipped: LaunchReadyResult['skipped'] = [];
    const chosen = this.withoutWriteConflicts(candidates, graph.writeConflicts(), skipped);

    // Sequential on purpose. Each launch is a controller subprocess plus an agent process;
    // firing them in one Promise.all would put N python calls and N agents on the machine
    // in the same instant, and the failure looks like the console hanging.
    const launched: LaunchReadyResult['launched'] = [];
    for (const ticket of chosen) {
      try {
        const run = await this.launcher.launch({
          repositoryId: input.repositoryId,
          slug: input.slug,
          ticketId: ticket.id.value,
          agentId: input.agentId,
          launchedBy: input.launchedBy,
          extraInstructions: input.extraInstructions,
          timeoutMinutes: input.timeoutMinutes,
          acknowledged: input.acknowledged,
        });
        launched.push({ ticketId: ticket.id.value, runId: run.runId });
      } catch (error) {
        // One refusal must not abandon the rest — a ticket already having an agent is the
        // common case here, and it is information rather than a failure.
        skipped.push({ ticketId: ticket.id.value, reason: (error as Error).message });
      }
    }

    this.logger.log(
      `launch-ready ${input.repositoryId}/${input.slug}: ${launched.length} launched, ${skipped.length} skipped`,
    );
    return { launched, skipped };
  }

  /**
   * Keeps the first of any conflicting pair and holds the other back.
   *
   * Deterministic by ticket id rather than clever: the held-back ticket becomes pickable
   * the moment the other reaches review, and a stable choice makes the skip message the
   * same on every run instead of alternating between two tickets.
   */
  private withoutWriteConflicts(
    candidates: Ticket[],
    conflicts: { a: string; b: string; paths: string[] }[],
    skipped: LaunchReadyResult['skipped'],
  ): Ticket[] {
    const eligible = new Set(candidates.map((t) => t.id.value));
    const taken = new Set<string>();

    for (const ticket of [...candidates].sort((x, y) => x.id.value.localeCompare(y.id.value))) {
      const id = ticket.id.value;
      const clash = conflicts.find(
        (c) =>
          (c.a === id && taken.has(c.b)) ||
          (c.b === id && taken.has(c.a)),
      );
      if (clash) {
        const other = clash.a === id ? clash.b : clash.a;
        skipped.push({
          ticketId: id,
          reason: `writes the same file as ${other} with nothing ordering them (${clash.paths.join(', ')}) — run it after that one`,
        });
        continue;
      }
      if (eligible.has(id)) taken.add(id);
    }

    return candidates.filter((t) => taken.has(t.id.value));
  }
}
