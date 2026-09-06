import { InvalidValueError, ValueObject } from '../../../../shared/kernel';

export interface AgentDefinitionProps {
  id: string;
  label: string;
  /** The executable, looked up on PATH. */
  binary: string;
  /** Arguments before the prompt. `{{prompt}}` is substituted when promptVia is 'arg'. */
  args: string[];
  /**
   * How the prompt reaches the CLI. `stdin` is the default and the safer one: a ticket's
   * full context runs to several kilobytes, and argv has a length limit that differs by
   * platform — hitting it produces a truncated prompt, not an error.
   */
  promptVia: 'stdin' | 'arg';
  /**
   * Argv for continuing a conversation the CLI already has, with `{{session}}` where the
   * session id goes. `null` means this CLI cannot resume.
   *
   * Null is the default and the only safe one. Resume is declared per agent and never
   * inferred: a wrong flag here does not fail, it drops the CLI into an interactive
   * session that hangs behind a pipe until the run's timeout kills it, holding the
   * ticket's only run slot for the whole wait.
   */
  resumeArgs: string[] | null;
  /** Detected on this machine. */
  available: boolean;
  /** Where the binary was found, for the diagnostics panel. */
  resolvedPath: string | null;
}

/**
 * One agent CLI the console can hand a ticket to.
 *
 * Multica's insight, and the reason this exists: an agent that lives in its own terminal
 * tab forgets everything when the session ends, and the human re-explains the same
 * context. Here the agent is handed the plan's own context — the ticket body, its
 * done-when checklist, what it may touch, and the slice's demo script — and its work
 * lands back on the same ticket.
 */
export class AgentDefinition extends ValueObject<AgentDefinitionProps> {
  private constructor(props: AgentDefinitionProps) {
    super(props);
  }

  static create(props: Partial<AgentDefinitionProps> & { id: string; binary: string }): AgentDefinition {
    return new AgentDefinition({
      id: props.id,
      label: props.label ?? props.id,
      binary: props.binary,
      args: props.args ?? [],
      promptVia: props.promptVia ?? 'stdin',
      resumeArgs: props.resumeArgs ?? null,
      available: props.available ?? false,
      resolvedPath: props.resolvedPath ?? null,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get label(): string {
    return this.props.label;
  }
  get binary(): string {
    return this.props.binary;
  }
  get promptVia(): 'stdin' | 'arg' {
    return this.props.promptVia;
  }
  get resumeArgs(): string[] | null {
    return this.props.resumeArgs;
  }
  /** Whether a finished run by this agent can be continued rather than restarted. */
  get canResume(): boolean {
    return this.props.resumeArgs !== null;
  }
  get available(): boolean {
    return this.props.available;
  }
  get resolvedPath(): string | null {
    return this.props.resolvedPath;
  }

  /** Argv for one run. The prompt is substituted only in `arg` mode. */
  argsFor(prompt: string): string[] {
    return this.props.args.map((arg) => (arg === '{{prompt}}' ? prompt : arg));
  }

  /**
   * Argv for continuing an existing conversation.
   *
   * Throws rather than falling back to `argsFor` when this agent declares no resume
   * invocation. A fallback would start a brand new session while the caller believed it
   * was continuing one — the agent would be re-told nothing, answer out of context, and
   * the console would present the result as a continuation. Failing here is the whole
   * point of the capability being declared.
   */
  argsForResume(sessionId: string, prompt: string): string[] {
    const template = this.props.resumeArgs;
    if (template === null) {
      throw new InvalidValueError(
        `${this.props.label} declares no resume invocation — start a new run instead of guessing a flag`,
      );
    }
    if (!sessionId.trim()) {
      throw new InvalidValueError('cannot resume without a session id');
    }
    return template.map((arg) => {
      if (arg === '{{session}}') return sessionId;
      if (arg === '{{prompt}}') return prompt;
      return arg;
    });
  }

  withAvailability(available: boolean, resolvedPath: string | null): AgentDefinition {
    return new AgentDefinition({ ...this.props, available, resolvedPath });
  }
}
