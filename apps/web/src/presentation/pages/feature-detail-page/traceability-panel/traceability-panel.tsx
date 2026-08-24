import type { TraceabilityPanelProps } from './traceability-panel.props';
import { TraceabilityPanelView } from './traceability-panel.view';

export function TraceabilityPanel(props: TraceabilityPanelProps) {
  return <TraceabilityPanelView {...props} />;
}
