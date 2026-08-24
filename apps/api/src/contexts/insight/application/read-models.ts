import { InboxItem } from '../domain/inbox-item';

/** One row of the portfolio table: a feature, seen from every context at once. */
export interface PortfolioRow {
  repositoryId: string;
  repositoryLabel: string;
  /** Which project this checkout belongs to. Two clones of one repo share it. */
  projectKey: string;
  projectLabel: string;
  branch: string | null;
  slug: string;
  /** False when the directory has no `.aidlc-state.yaml` — a plan outside the controller. */
  managed: boolean;
  gate: string;
  gateTitle: string;
  nextGate: string | null;
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
  /** Present only when a gate check has actually been run for this feature. */
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
  /** Feature count per gate, `none` included. Where the portfolio actually piles up. */
  gateHistogram: Record<string, number>;
  remainingHours: number;
}

/** A ticket that could be started right now, anywhere in the portfolio. */
export interface ReadyTicketRow {
  repositoryId: string;
  repositoryLabel: string;
  featureSlug: string;
  ticketId: string;
  uowId: string | null;
  uowTitle: string | null;
  title: string;
  layer: string;
  layerDeclared: boolean;
  type: string;
  estimateHours: number;
  estimateLabel: string;
  verifies: string[];
  touches: string[];
  /** How many tickets this one unblocks. The lever: high means it is worth doing first. */
  unblocks: number;
  /** True when this ticket sits on the feature's critical path. */
  onCriticalPath: boolean;
  risk: string;
  gate: string;
}

export interface InboxResult {
  items: InboxItem[];
  counts: Record<string, number>;
  /** Features whose next gate has never been checked, so `gate_ready` cannot be known. */
  featuresWithoutGateCheck: number;
}

export interface FeatureDetail {
  repositoryId: string;
  repositoryLabel: string;
  repositoryPath: string;
  slug: string;
  directory: string;
  managed: boolean;
  profile: string;
  gate: string;
  gateTitle: string;
  nextGate: string | null;
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
  assumptions: {
    id: string;
    text: string;
    confidence: string;
    blocking: boolean;
    blastRadius: string;
    status: string;
    resolution: string;
    isOpen: boolean;
    isUnjustified: boolean;
  }[];
  acceptanceCriteria: {
    id: string;
    title: string;
    story: string | null;
    gherkin: string | null;
    coveredBy: string[];
  }[];
  design: { present: boolean; missingSections: string[]; todoCount: number; approach: string | null };
  decisions: { id: string; title: string; status: string; unresolved: boolean }[];
  unitsOfWork: {
    id: string;
    title: string;
    slug: string;
    status: string;
    risk: string;
    demoable: boolean;
    duration: string;
    dependsOn: string[];
    verifies: string[];
    rollback: string;
    hasDemoScript: boolean;
    demoScript: string | null;
    definitionOfDone: { text: string; done: boolean }[];
    ticketIds: string[];
    effortHours: number;
    doneCount: number;
  }[];
  tickets: {
    id: string;
    uow: string | null;
    title: string;
    layer: string;
    layerDeclared: boolean;
    type: string;
    estimateHours: number;
    estimateLabel: string;
    status: string;
    dependsOn: string[];
    blocks: string[];
    verifies: string[];
    touches: string[];
    assumptions: string[];
    doneWhen: { text: string; done: boolean }[];
    unmetDependencies: number;
    ready: boolean;
    onCriticalPath: boolean;
    filePath: string;
    parseError: string | null;
    /**
     * Who last moved this ticket into review, from the audit trail.
     *
     * The controller enforces that work passes *through* review; it does not compare
     * identities, so the same person can submit and accept. The console surfaces that
     * rather than pretending otherwise — and rather than adding an enforcement of its
     * own, which would put a second decision-maker in a system whose whole point is
     * having exactly one.
     */
    lastSubmittedBy: string | null;
  }[];
  graph: {
    waves: string[][];
    cycle: string[];
    criticalPath: string[];
    criticalPathHours: number;
    totalEffortHours: number;
    remainingHours: number;
    writeConflicts: { a: string; b: string; paths: string[] }[];
    danglingReferences: { from: string; to: string; kind: string }[];
  };
  history: {
    gate: string;
    action: string;
    at: string | null;
    by: string;
    ticket: string | null;
    reason: string | null;
    evidence: string | null;
  }[];
  loadErrors: string[];
  documents: string[];
  /** Null when no gate check has been run yet in this session. */
  gateVerdict: {
    gate: string;
    passed: boolean;
    checkedAt: string;
    error: string | null;
    findings: { level: string; message: string }[];
  } | null;
}
