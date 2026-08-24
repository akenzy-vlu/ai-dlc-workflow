import type { AssumptionsPanelProps } from './assumptions-panel.props';
import { AssumptionsPanelView } from './assumptions-panel.view';

export function AssumptionsPanel(props: AssumptionsPanelProps) {
  return <AssumptionsPanelView {...props} />;
}
