import type { GateValue } from '@domain/enums';

export interface GateTagProps {
  gate: GateValue;
  /** False when the feature has no state file — outside the controller entirely. */
  managed?: boolean;
}

export interface GateTagViewProps {
  label: string;
  tooltip: string;
  color: string | undefined;
  dashed: boolean;
}
