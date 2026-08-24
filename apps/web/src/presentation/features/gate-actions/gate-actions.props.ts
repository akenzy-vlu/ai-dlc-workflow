import type { FeatureDetail } from '@domain/entities';

export interface GateActionsProps {
  feature: FeatureDetail;
}

export interface GateActionsViewProps {
  managed: boolean;
  slug: string;
  currentGate: string;
  nextGate: string | null;
  actor: string;
  /** True only when a check has been run *for the next gate* and it passed. */
  readyToApprove: boolean;
  checking: boolean;
  passing: boolean;
  reopening: boolean;
  reopenOpen: boolean;
  reopenReason: string;
  onCheck: () => void;
  onPass: () => void;
  onOpenReopen: () => void;
  onCloseReopen: () => void;
  onReopenReasonChange: (reason: string) => void;
  onReopen: () => void;
  onSetName: () => void;
}
