import type { GateCode, GateValue, WorkStatus } from '../enums';

/** One row of the portfolio: a feature seen from every context at once. */
export interface FeatureSummary {
  repositoryId: string;
  repositoryLabel: string;
  projectKey: string;
  projectLabel: string;
  branch: string | null;
  slug: string;
  /** False when the directory has no state file — a plan outside the controller. */
  managed: boolean;
  gate: GateValue;
  gateTitle: string;
  nextGate: GateCode | null;
  profile: string;
  unitOfWorkCount: number;
  ticketCount: number;
  ticketsDone: number;
  ticketsInReview: number;
  ticketsInProgress: number;
  ticketsBlocked: number;
  progress: number;
  effortHours: number;
  remainingHours: number;
  criticalPathHours: number;
  blockingAssumptionsOpen: number;
  unresolvedAdrs: number;
  acceptanceCriteriaCount: number;
  acceptanceCriteriaUncovered: number;
  writeConflicts: number;
  readyTicketCount: number;
  /** Present only when a gate check has actually been run. Never inferred. */
  nextGateVerdict: 'pass' | 'fail' | null;
  loadErrorCount: number;
  plansLocalOnly: boolean;
  lastActivityAt: string | null;
  observedAt: string;
}

export interface PortfolioSummary {
  projects: number;
  repositories: number;
  features: number;
  managedFeatures: number;
  unmanagedFeatures: number;
  tickets: number;
  ticketsDone: number;
  ticketsReady: number;
  ticketsInReview: number;
  blockingAssumptionsOpen: number;
  /** Feature count per gate. Where the portfolio actually piles up. */
  gateHistogram: Record<string, number>;
  remainingHours: number;
}

export interface Portfolio {
  rows: FeatureSummary[];
  summary: PortfolioSummary;
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface Assumption {
  id: string;
  text: string;
  confidence: string;
  blocking: boolean;
  blastRadius: string;
  status: string;
  resolution: string;
  isOpen: boolean;
  /** Settled with no note saying who settled it. `check_g1` refuses this. */
  isUnjustified: boolean;
}

export interface AcceptanceCriterion {
  id: string;
  title: string;
  story: string | null;
  gherkin: string | null;
  coveredBy: string[];
}

export interface ArchitectureDecision {
  id: string;
  title: string;
  status: string;
  /** Still `proposed`. Holds G2 shut, and G5 after it. */
  unresolved: boolean;
}

export interface UnitOfWork {
  id: string;
  title: string;
  slug: string;
  status: WorkStatus;
  risk: string;
  /** A slice that cannot be demoed is a layer, not a slice. G3 refuses it. */
  demoable: boolean;
  duration: string;
  dependsOn: string[];
  verifies: string[];
  rollback: string;
  hasDemoScript: boolean;
  demoScript: string | null;
  definitionOfDone: ChecklistItem[];
  ticketIds: string[];
  effortHours: number;
  doneCount: number;
}

export interface Ticket {
  id: string;
  uow: string | null;
  title: string;
  layer: string;
  /** False when the ticket names a layer the repo has not declared — a G3 error. */
  layerDeclared: boolean;
  type: string;
  estimateHours: number;
  estimateLabel: string;
  status: WorkStatus;
  dependsOn: string[];
  blocks: string[];
  verifies: string[];
  touches: string[];
  assumptions: string[];
  doneWhen: ChecklistItem[];
  unmetDependencies: number;
  ready: boolean;
  onCriticalPath: boolean;
  filePath: string;
  parseError: string | null;
  /** Who last moved it into review. The controller does not compare names; we surface it. */
  lastSubmittedBy: string | null;
}

export interface TicketGraph {
  waves: string[][];
  /** A dependency loop. A hard G3 failure that makes every other number meaningless. */
  cycle: string[];
  criticalPath: string[];
  criticalPathHours: number;
  totalEffortHours: number;
  remainingHours: number;
  writeConflicts: { a: string; b: string; paths: string[] }[];
  danglingReferences: { from: string; to: string; kind: string }[];
}

export interface GateVerdict {
  gate: GateValue;
  passed: boolean;
  checkedAt: string;
  error: string | null;
  findings: { level: string; message: string }[];
}

export interface AuditEntry {
  gate: GateValue;
  action: string;
  at: string | null;
  by: string;
  ticket: string | null;
  reason: string | null;
  evidence: string | null;
}

export interface FeatureDetail {
  repositoryId: string;
  repositoryLabel: string;
  repositoryPath: string;
  slug: string;
  directory: string;
  managed: boolean;
  profile: string;
  gate: GateValue;
  gateTitle: string;
  nextGate: GateCode | null;
  nextGateTitle: string | null;
  createdAt: string | null;
  constructionUnlocked: boolean;
  layerVocabulary: string[];
  ruleset: number | null;
  intent: {
    present: boolean;
    missingSections: string[];
    todoCount: number;
    problem: string | null;
    successSignal: string | null;
    outOfScope: string | null;
  };
  architectureMap: { present: boolean; verifiedBy: string | null };
  assumptions: Assumption[];
  acceptanceCriteria: AcceptanceCriterion[];
  design: { present: boolean; missingSections: string[]; todoCount: number; approach: string | null };
  decisions: ArchitectureDecision[];
  unitsOfWork: UnitOfWork[];
  tickets: Ticket[];
  graph: TicketGraph;
  history: AuditEntry[];
  loadErrors: string[];
  documents: string[];
  gateVerdict: GateVerdict | null;
}

export interface IntentDraft {
  problem: string;
  successSignal: string;
  outOfScope: string[];
  constraints: string;
}

export interface CreatedFeature {
  repositoryId: string;
  slug: string;
  directory: string;
  /** False when the controller-written scaffold had already been edited by hand. */
  intentWritten: boolean;
  output: string;
  command: string;
}

/**
 * The result of a controller subprocess.
 *
 * `command` and `exitCode` travel with the output because a refusal the user can
 * reproduce in a terminal is a refusal they can act on.
 */
export interface ControllerOutcome {
  accepted: boolean;
  output: string;
  command: string;
  exitCode: number;
}
