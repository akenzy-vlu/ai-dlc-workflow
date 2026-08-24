import { Injectable, Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

export type PlanEvent =
  | { type: 'plan.changed'; repositoryId: string; slug: string | null; at: string }
  | { type: 'gates.sweep'; done: number; total: number; at: string }
  | { type: 'controller.ran'; command: string; accepted: boolean; at: string }
  | {
      type: 'agent.run';
      runId: string;
      status: string;
      ticketId: string;
      slug: string;
      repositoryId: string;
      /** Null on a status change; a line on output. */
      line: { at: string; stream: string; text: string } | null;
      /**
       * What the agent is doing right now, when the CLI reports it.
       *
       * Carried on the event rather than fetched, so a client showing "Bash — pnpm test"
       * costs one socket frame instead of a refetch per tool call.
       */
      activity: { at: string; kind: string; tool?: string; detail?: string; text?: string } | null;
      at: string;
    }
  | {
      type: 'setup.progress';
      step: string;
      state: 'running' | 'done' | 'failed';
      line: string | null;
      at: string;
    };

/**
 * Pushes "something on disk changed" to open browsers.
 *
 * The plan files are edited by at least three parties — a person in an editor, a planning
 * agent, and this console's own controller calls. Polling would make the console feel a
 * step behind all of them; without it, two tabs disagree about whether a ticket is done.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: true }, path: '/events' })
export class PlanEventsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(PlanEventsGateway.name);

  @WebSocketServer()
  private server?: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`client connected: ${client.id}`);
  }

  emit(event: PlanEvent): void {
    this.server?.emit(event.type, event);
  }
}
