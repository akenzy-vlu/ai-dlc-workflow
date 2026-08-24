import type { IntentPanelProps } from './intent-panel.props';
import { IntentPanelView } from './intent-panel.view';

export function IntentPanel({ feature }: IntentPanelProps) {
  return (
    <IntentPanelView
      architectureMap={feature.architectureMap}
      missingSections={[
        ...feature.intent.missingSections.map((section) => `00-intent.md: ${section}`),
        ...feature.design.missingSections.map((section) => `03-logical-design.md: ${section}`),
      ]}
      todoCount={feature.intent.todoCount + feature.design.todoCount}
      sections={[
        { title: 'Problem', body: feature.intent.problem },
        { title: 'Success signal', body: feature.intent.successSignal },
        { title: 'Out of scope', body: feature.intent.outOfScope },
        { title: 'Approach', body: feature.design.approach },
      ]}
      decisions={feature.decisions}
    />
  );
}
