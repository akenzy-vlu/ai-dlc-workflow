import { Entity, Estimate, Layer, TicketId, TicketType, UowId, WorkStatus } from '../../../../shared/kernel';

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface TicketProps {
  id: TicketId;
  uow: UowId | null;
  title: string;
  layer: Layer;
  type: TicketType;
  estimate: Estimate;
  status: WorkStatus;
  dependsOn: TicketId[];
  blocks: TicketId[];
  verifies: string[];
  /** `touches` entries verbatim, `# new` annotations included. */
  touches: string[];
  assumptions: string[];
  doneWhen: ChecklistItem[];
  filePath: string;
  /** Non-null when the frontmatter could not be parsed. Shown, not swallowed. */
  parseError: string | null;
}

/**
 * The unit of assignment. Roughly what Multica calls an issue, except its dependencies
 * are declared rather than implied, so "what can be picked up right now" is computable.
 */
export class Ticket extends Entity<TicketId> {
  private constructor(private readonly props: TicketProps) {
    super(props.id);
  }

  static create(props: TicketProps): Ticket {
    return new Ticket(props);
  }

  get uow(): UowId | null {
    return this.props.uow;
  }
  get title(): string {
    return this.props.title;
  }
  get layer(): Layer {
    return this.props.layer;
  }
  get type(): TicketType {
    return this.props.type;
  }
  get estimate(): Estimate {
    return this.props.estimate;
  }
  get status(): WorkStatus {
    return this.props.status;
  }
  get dependsOn(): readonly TicketId[] {
    return this.props.dependsOn;
  }
  get blocks(): readonly TicketId[] {
    return this.props.blocks;
  }
  get verifies(): readonly string[] {
    return this.props.verifies;
  }
  get touches(): readonly string[] {
    return this.props.touches;
  }
  get assumptions(): readonly string[] {
    return this.props.assumptions;
  }
  get doneWhen(): readonly ChecklistItem[] {
    return this.props.doneWhen;
  }
  get filePath(): string {
    return this.props.filePath;
  }
  get parseError(): string | null {
    return this.props.parseError;
  }

  get untickedCount(): number {
    return this.props.doneWhen.filter((i) => !i.done).length;
  }

  /**
   * Files this ticket writes, with `# new`-style annotations removed.
   * Mirrors `touch_paths` in uow_graph.py — the annotation is metadata, not a path.
   */
  get writePaths(): string[] {
    return this.props.touches
      .map((p) => p.split('#')[0].trim())
      .filter((p) => p.length > 0);
  }

  /** `aidlc.py` refuses `submit`/`accept` while any done-when box is unticked. */
  get canBeSubmitted(): boolean {
    return this.untickedCount === 0;
  }
}
