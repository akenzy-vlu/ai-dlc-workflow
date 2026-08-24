import type { ControllerOutcome } from '@domain/entities';

export interface ControllerOutputProps {
  outcome: ControllerOutcome | null;
  title: string;
  open: boolean;
  onClose: () => void;
}

export type ControllerOutputViewProps = ControllerOutputProps;
