import type { GateCode, GateValue } from '@domain/enums';

export interface GateTimelineProps {
  current: GateValue;
  onSelect?: (gate: GateCode) => void;
  selected?: GateValue | null;
}

export interface GateStep {
  gate: GateCode;
  title: string;
  passed: boolean;
  /** The gate being worked towards — the only one that needs a person. */
  isNext: boolean;
  isSelected: boolean;
}

export interface GateTimelineViewProps {
  steps: GateStep[];
  onSelect?: (gate: GateCode) => void;
}
