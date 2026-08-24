import type { ControllerOutcome, EvidenceResult, Verification } from '@domain/entities';
import type { FeatureRef } from '@domain/value-objects';

export interface VerificationPanelProps extends FeatureRef {}

export interface VerificationPanelViewProps extends FeatureRef {
  verification: Verification | undefined;
  loading: boolean;
  running: boolean;
  checking: boolean;
  confirmWriteOpen: boolean;
  acceptWrites: boolean;
  outcome: { title: string; result: ControllerOutcome } | null;
  artifactUrl: (relativePath: string) => string;
  onRun: (write: boolean) => void;
  onOpenConfirmWrite: () => void;
  onCloseConfirmWrite: () => void;
  onAcceptWritesChange: (value: boolean) => void;
  onCheckEvidence: () => void;
  onCloseOutcome: () => void;
  results: EvidenceResult[];
}
