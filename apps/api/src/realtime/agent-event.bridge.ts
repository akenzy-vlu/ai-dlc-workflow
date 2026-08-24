import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';

import { AgentLauncherService } from '../contexts/agents/application/agent-launcher.service';
import { RunnerSetupService } from '../contexts/verification/application/runner-setup.service';
import { PlanEventsGateway } from './plan-events.gateway';

/**
 * Puts agent output on the socket.
 *
 * A separate class rather than a socket call inside the launcher, so the agents context
 * keeps no dependency on the transport: it publishes to an in-process listener and does
 * not know or care that a browser is watching.
 */
@Injectable()
export class AgentEventBridge implements OnModuleInit, OnApplicationShutdown {
  private readonly unsubscribers: (() => void)[] = [];

  constructor(
    private readonly launcher: AgentLauncherService,
    private readonly setup: RunnerSetupService,
    private readonly events: PlanEventsGateway,
  ) {}

  onModuleInit(): void {
    this.unsubscribers.push(
      this.setup.onEvent((event) =>
        this.events.emit({
          type: 'setup.progress',
          step: event.step,
          state: event.state,
          line: event.line,
          at: event.at,
        }),
      ),
    );

    this.unsubscribers.push(
      this.launcher.onEvent((run, line, activity) => {
        this.events.emit({
          type: 'agent.run',
          runId: run.id,
          status: run.status,
          ticketId: run.ticketId,
          slug: run.slug,
          repositoryId: run.repositoryId,
          line: line ? { at: line.at, stream: line.stream, text: line.text } : null,
          // The step that just happened. Null with a null `line` means the run itself
          // started or stopped — the only event a client has to refetch on.
          activity: activity ?? null,
          at: new Date().toISOString(),
        });
      }),
    );
  }

  onApplicationShutdown(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
  }
}
