import { AggregateRoot, InvalidValueError } from '../../../../shared/kernel';
import { AgentActivity, AgentTelemetry, emptyTelemetry } from './agent-activity';

export const RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export interface LogLine {
  at: string;
  stream: 'stdout' | 'stderr' | 'console';
  text: string;
}

export interface AgentRunProps {
  id: string;
  repositoryId: string;
  repositoryLabel: string;
  slug: string;
  ticketId: string;
  agentId: string;
  agentLabel: string;
  /** The human who launched it. Distinct from the agent, and both go in the trail. */
  launchedBy: string;
  /** The name recorded against the controller transition — the agent's, not the human's. */
  actingAs: string;
  cwd: string;
  command: string;
  promptPreview: string;
  createdAt: string;
  /**
   * The run this one answers, or null for a first launch.
   *
   * A reply is a run: its `promptPreview` is the message, and this is the only link a
   * thread needs. Deliberately not paired with a `children` collection — the thread is a
   * query over `list({repositoryId, slug, ticketId})` ordered by `createdAt`, and an
   * aggregate holding its own descendants would be a second copy to keep coherent by hand.
   */
  parentRunId?: string | null;
}

/**
 * One launch of an agent CLI against one ticket.
 *
 * The console owns this aggregate: AI-DLC has no concept of a run, only of a ticket that
 * changed state and who changed it. The bridge is deliberate — before an agent starts,
 * the console asks the controller to move the ticket to `in_progress` under the agent's
 * name. If the controller refuses (gate below G3, dependencies unmet), nothing launches.
 * That is the gate doing its job on a robot exactly as it would on a person.
 */
export class AgentRun extends AggregateRoot<string> {
  private _status: RunStatus = 'queued';
  private _exitCode: number | null = null;
  private _startedAt: string | null = null;
  private _finishedAt: string | null = null;
  private readonly _log: LogLine[] = [];
  private readonly _activities: AgentActivity[] = [];
  private _telemetry: AgentTelemetry = emptyTelemetry();

  private constructor(private readonly props: AgentRunProps) {
    super(props.id);
  }

  static create(props: AgentRunProps): AgentRun {
    if (!props.launchedBy.trim()) throw new InvalidValueError('a run must record who launched it');
    return new AgentRun(props);
  }

  get repositoryId(): string {
    return this.props.repositoryId;
  }
  get repositoryLabel(): string {
    return this.props.repositoryLabel;
  }
  get slug(): string {
    return this.props.slug;
  }
  get ticketId(): string {
    return this.props.ticketId;
  }
  get agentId(): string {
    return this.props.agentId;
  }
  get agentLabel(): string {
    return this.props.agentLabel;
  }
  get launchedBy(): string {
    return this.props.launchedBy;
  }
  get actingAs(): string {
    return this.props.actingAs;
  }
  get cwd(): string {
    return this.props.cwd;
  }
  get command(): string {
    return this.props.command;
  }
  get promptPreview(): string {
    return this.props.promptPreview;
  }
  get createdAt(): string {
    return this.props.createdAt;
  }
  get parentRunId(): string | null {
    return this.props.parentRunId ?? null;
  }
  /** Whether this run continues an earlier one rather than starting the work. */
  get isReply(): boolean {
    return this.parentRunId !== null;
  }
  get status(): RunStatus {
    return this._status;
  }
  get exitCode(): number | null {
    return this._exitCode;
  }
  get startedAt(): string | null {
    return this._startedAt;
  }
  get finishedAt(): string | null {
    return this._finishedAt;
  }
  get log(): readonly LogLine[] {
    return this._log;
  }
  get activities(): readonly AgentActivity[] {
    return this._activities;
  }
  get telemetry(): AgentTelemetry {
    return this._telemetry;
  }

  /**
   * The tool the agent is in the middle of, or null once it has stopped.
   *
   * A finished run has no *current* anything — reporting the last tool it touched as if
   * it were still happening is the kind of stale UI that teaches people to distrust the
   * screen. The transcript is where a finished run's history lives.
   */
  get currentActivity(): AgentActivity | null {
    if (this.isTerminal) return null;
    for (let i = this._activities.length - 1; i >= 0; i -= 1) {
      if (this._activities[i].kind === 'tool') return this._activities[i];
    }
    return null;
  }
  get isTerminal(): boolean {
    return this._status === 'succeeded' || this._status === 'failed' || this._status === 'cancelled';
  }

  start(at: string): void {
    this._status = 'running';
    this._startedAt = at;
  }

  append(line: LogLine): void {
    this._log.push(line);
  }

  observe(activity: AgentActivity): void {
    this._activities.push(activity);
    if (activity.kind === 'tool') this._telemetry = { ...this._telemetry, toolCalls: this._telemetry.toolCalls + 1 };
  }

  /**
   * Merge what the stream reported about the run itself.
   *
   * Undefined fields in the patch leave the current value alone: the session id arrives
   * on the first event and the cost on the last, and a naive assign would erase one with
   * the other.
   */
  mergeTelemetry(patch: Partial<AgentTelemetry>): void {
    const next = { ...this._telemetry };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined && value !== null) (next as Record<string, unknown>)[key] = value;
    }
    this._telemetry = next;
  }

  /**
   * Restores a persisted run's counters without replaying its stream.
   *
   * Merged over `emptyTelemetry()` rather than assigned. A run written before a counter
   * existed has no key for it, and a bare assign would restore that field as `undefined` —
   * which is neither the `null` that means "not reported" nor a number, and which
   * disappears entirely the next time the object is serialised. Widening this interface is
   * expected; losing the older runs to it is not.
   */
  restoreTelemetry(telemetry: AgentTelemetry): void {
    this._telemetry = { ...emptyTelemetry(), ...telemetry };
  }

  finish(exitCode: number, at: string, cancelled = false): void {
    this._exitCode = exitCode;
    this._finishedAt = at;
    this._status = cancelled ? 'cancelled' : exitCode === 0 ? 'succeeded' : 'failed';
  }

  /**
   * A finished run does not accept the ticket. The agent wrote code; a person still has
   * to look at it. `submit` is the furthest the console will take an agent's work, and
   * even that is a separate, deliberate action.
   */
  get suggestsSubmit(): boolean {
    return this._status === 'succeeded';
  }

  /**
   * Whether this run can be continued rather than restarted.
   *
   * A rejected ticket handed to a fresh agent gets re-told everything it already worked
   * out; handed back to its own session it starts from what it knows. That is only
   * possible when the CLI reported a session id, which is to say when it was run with
   * `--output-format stream-json`.
   */
  get isResumable(): boolean {
    return this.isTerminal && this._telemetry.sessionId !== null;
  }
}
