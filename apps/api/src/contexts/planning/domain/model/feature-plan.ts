import { AggregateRoot, FeatureRef } from '../../../../shared/kernel';
import { AcceptanceCriterion } from './acceptance-criterion';
import { ArchitectureDecision } from './architecture-decision';
import { Assumption } from './assumption';

export interface IntentDocument {
  present: boolean;
  /** Sections `check_g0` requires: Problem, Success signal, Out of scope. */
  missingSections: string[];
  todoCount: number;
  problem: string | null;
  successSignal: string | null;
  outOfScope: string | null;
}

export interface DesignDocument {
  present: boolean;
  /** Sections `check_g2` requires: Approach, Alternatives rejected, Error taxonomy, ADR. */
  missingSections: string[];
  todoCount: number;
  approach: string | null;
}

export interface ArchitectureMap {
  present: boolean;
  /**
   * `verified_by:` in `.ai/architecture.md`. Unsigned means a human has not read the
   * discovery draft — the cheapest, highest-leverage step in the whole method, and a
   * hard G0 blocker.
   */
  verifiedBy: string | null;
}

/**
 * The Inception half of a feature: what problem, what we are assuming, what we promised,
 * and which decisions were hard enough to write down.
 *
 * This aggregate is read-only. Editing an intent means editing `00-intent.md` in the repo
 * — in an editor, or with a planning agent — and the console re-reads it. There is
 * deliberately no write path here: a form that rewrites the markdown would fight every
 * other author of that file, and the file is reviewed in pull requests for a reason.
 */
export class FeaturePlan extends AggregateRoot<string> {
  private constructor(
    readonly ref: FeatureRef,
    readonly directory: string,
    readonly intent: IntentDocument,
    readonly assumptions: readonly Assumption[],
    readonly acceptanceCriteria: readonly AcceptanceCriterion[],
    readonly design: DesignDocument,
    readonly decisions: readonly ArchitectureDecision[],
    readonly architectureMap: ArchitectureMap,
    /** Artifact filenames present in the feature directory, for the document browser. */
    readonly documents: readonly string[],
  ) {
    super(ref.key);
  }

  static create(params: {
    ref: FeatureRef;
    directory: string;
    intent: IntentDocument;
    assumptions: Assumption[];
    acceptanceCriteria: AcceptanceCriterion[];
    design: DesignDocument;
    decisions: ArchitectureDecision[];
    architectureMap: ArchitectureMap;
    documents: string[];
  }): FeaturePlan {
    return new FeaturePlan(
      params.ref,
      params.directory,
      params.intent,
      params.assumptions,
      params.acceptanceCriteria,
      params.design,
      params.decisions,
      params.architectureMap,
      params.documents,
    );
  }

  /** Assumptions that hold G1 shut. The standup list, per `project_registry.py`. */
  get blockingOpenAssumptions(): Assumption[] {
    return this.assumptions.filter((a) => a.blocksElaboration);
  }

  get openAssumptions(): Assumption[] {
    return this.assumptions.filter((a) => a.status.isOpen);
  }

  get unjustifiedAssumptions(): Assumption[] {
    return this.assumptions.filter((a) => a.isUnjustified);
  }

  get unresolvedDecisions(): ArchitectureDecision[] {
    return this.decisions.filter((d) => d.isUnresolved);
  }

  get acceptanceCriteriaIds(): string[] {
    return this.acceptanceCriteria.map((ac) => ac.id);
  }
}
