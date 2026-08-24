import type { TicketAction, WorkStatus } from '@domain/enums';
import type { FeatureRef } from '@domain/value-objects';

export interface TicketActionsProps extends FeatureRef {
  ticketId: string;
  status: WorkStatus;
  untickedCount: number;
  /** Who put it into review. Used to warn on self-accept — never to block it. */
  lastSubmittedBy?: string | null;
  compact?: boolean;
}

export interface TicketActionsViewProps {
  ticketId: string;
  actions: TicketAction[];
  compact: boolean;
  pending: TicketAction | null;
  busy: boolean;
  blockedByChecklist: boolean;
  untickedCount: number;
  isSelfAccept: boolean;
  lastSubmittedBy: string | null;
  actor: string;
  reason: string;
  noReview: boolean;
  onRun: (action: TicketAction) => void;
  onCancel: () => void;
  onReasonChange: (reason: string) => void;
  onNoReviewChange: (value: boolean) => void;
  onConfirmReject: () => void;
  onConfirmDone: () => void;
  onConfirmAccept: () => void;
}
