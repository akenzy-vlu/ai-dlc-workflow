import { TicketAction } from '../../../../shared/kernel';

export const PLAN_MUTATOR = Symbol('PLAN_MUTATOR');

export interface ControllerOutcome {
  accepted: boolean;
  /** stdout and stderr of the controller, verbatim. A refusal is information. */
  output: string;
  command: string;
  exitCode: number;
}

/**
 * The only write path into a plan, and it is a subprocess.
 *
 * Every method here shells out to `aidlc.py` or `uow_graph.py`. There is no adapter that
 * edits a `status:` line, and there must never be one: the moment the console can write
 * ticket state directly, the review rule ("an implementer does not accept its own work")
 * becomes a suggestion, and `05-ticket-graph.md` starts drifting from the tickets it is
 * supposed to be derived from.
 */
export interface PlanMutatorPort {
  transitionTicket(params: {
    featureDirectory: string;
    ticketId: string;
    action: TicketAction;
    by: string;
    reason?: string;
    /** Records a review bypass in the audit trail rather than hiding it. */
    noReview?: boolean;
  }): Promise<ControllerOutcome>;

  /** `uow_graph.py --write`: regenerates the three derived files from the tickets. */
  regenerateDerivedArtifacts(featureDirectory: string): Promise<ControllerOutcome>;

  /** `uow_graph.py` with no flags: validate only, change nothing. */
  validate(featureDirectory: string): Promise<ControllerOutcome>;

  /** `aidlc lint-touches --repo <root>`: every declared path exists or is marked new. */
  lintTouches(featureDirectory: string, repoRoot: string): Promise<ControllerOutcome>;
}
