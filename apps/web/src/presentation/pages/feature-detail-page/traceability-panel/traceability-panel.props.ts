import type { AcceptanceCriterion } from '@domain/entities';

export interface TraceabilityPanelProps {
  criteria: AcceptanceCriterion[];
}

export type TraceabilityPanelViewProps = TraceabilityPanelProps;
