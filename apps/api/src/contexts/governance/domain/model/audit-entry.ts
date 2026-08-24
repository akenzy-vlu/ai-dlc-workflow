import { Gate } from '../../../../shared/kernel';

export interface AuditEntryProps {
  gate: Gate;
  action: string;
  at: Date | null;
  by: string;
  ticket: string | null;
  reason: string | null;
  evidence: string | null;
}

/**
 * One line of the append-only trail in `.aidlc-state.yaml`.
 *
 * This is the record of who approved what, and it is the reason `project_registry.py`
 * treats `gate_event` as the one table it never rebuilds: when a repo does not commit
 * `.ai/`, this trail is the only durable evidence that a human ever looked.
 */
export class AuditEntry {
  private constructor(private readonly props: AuditEntryProps) {}

  static create(props: AuditEntryProps): AuditEntry {
    return new AuditEntry(props);
  }

  get gate(): Gate {
    return this.props.gate;
  }
  get action(): string {
    return this.props.action;
  }
  get at(): Date | null {
    return this.props.at;
  }
  get by(): string {
    return this.props.by;
  }
  get ticket(): string | null {
    return this.props.ticket;
  }
  get reason(): string | null {
    return this.props.reason;
  }
  get evidence(): string | null {
    return this.props.evidence;
  }

  get isGateApproval(): boolean {
    return this.props.action === 'passed';
  }
  get isReopen(): boolean {
    return this.props.action.startsWith('reopen');
  }
  /** `done (review bypassed)` — solo work, recorded rather than concealed. */
  get isReviewBypass(): boolean {
    return this.props.action.includes('review bypassed');
  }
}
