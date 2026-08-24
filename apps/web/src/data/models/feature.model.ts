export interface FeatureSummaryModel {
  repositoryId: string;
  repositoryLabel: string;
  projectKey: string;
  projectLabel: string;
  branch: string | null;
  slug: string;
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
  nextGateVerdict: 'pass' | 'fail' | null;
  loadErrorCount: number;
  plansLocalOnly: boolean;
  lastActivityAt: string | null;
  observedAt: string;
}

export interface PortfolioSummaryModel {
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
  gateHistogram: Record<string, number>;
  remainingHours: number;
}

export interface PortfolioModel {
  rows: FeatureSummaryModel[];
  summary: PortfolioSummaryModel;
}

export interface ChecklistItemModel {
  text: string;
  done: boolean;
}

export interface AssumptionModel {
  id: string;
  text: string;
  confidence: string;
  blocking: boolean;
  blastRadius: string;
  status: string;
  resolution: string;
  isOpen: boolean;
  isUnjustified: boolean;
}

export interface AcceptanceCriterionModel {
  id: string;
  title: string;
  story: string | null;
  gherkin: string | null;
  coveredBy: string[];
}

export interface UnitOfWorkModel {
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
  definitionOfDone: ChecklistItemModel[];
  ticketIds: string[];
  effortHours: number;
  doneCount: number;
}

export interface TicketModel {
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
  doneWhen: ChecklistItemModel[];
  unmetDependencies: number;
  ready: boolean;
  onCriticalPath: boolean;
  filePath: string;
  parseError: string | null;
  lastSubmittedBy: string | null;
}

export interface GateVerdictModel {
  gate: string;
  passed: boolean;
  checkedAt: string;
  error: string | null;
  findings: { level: string; message: string }[];
}

export interface AuditEntryModel {
  gate: string;
  action: string;
  at: string | null;
  by: string;
  ticket: string | null;
  reason: string | null;
  evidence: string | null;
}

export interface FeatureDetailModel {
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
  assumptions: AssumptionModel[];
  acceptanceCriteria: AcceptanceCriterionModel[];
  design: { present: boolean; missingSections: string[]; todoCount: number; approach: string | null };
  decisions: { id: string; title: string; status: string; unresolved: boolean }[];
  unitsOfWork: UnitOfWorkModel[];
  tickets: TicketModel[];
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
  history: AuditEntryModel[];
  loadErrors: string[];
  documents: string[];
  gateVerdict: GateVerdictModel | null;
}

export interface ControllerOutcomeModel {
  accepted: boolean;
  output: string;
  command: string;
  exitCode: number;
}

export interface CreatedFeatureModel {
  repositoryId: string;
  slug: string;
  directory: string;
  intentWritten: boolean;
  output: string;
  command: string;
}
