import type { Assumption } from '@domain/entities';

export interface AssumptionsPanelProps {
  assumptions: Assumption[];
}

export type AssumptionsPanelViewProps = AssumptionsPanelProps;
