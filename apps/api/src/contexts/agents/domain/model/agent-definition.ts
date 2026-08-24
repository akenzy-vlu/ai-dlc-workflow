import { ValueObject } from '../../../../shared/kernel';

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

  withAvailability(available: boolean, resolvedPath: string | null): AgentDefinition {
    return new AgentDefinition({ ...this.props, available, resolvedPath });
  }
}
