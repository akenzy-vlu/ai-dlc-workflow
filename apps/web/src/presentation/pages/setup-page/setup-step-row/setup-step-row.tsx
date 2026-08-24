import type { SetupStepRowProps } from './setup-step-row.props';
import { SetupStepRowView } from './setup-step-row.view';

export function SetupStepRow({ step, state, ready }: SetupStepRowProps) {
  return (
    <SetupStepRowView
      title={step.title}
      detail={step.detail}
      state={state ?? (ready ? 'done' : 'pending')}
    />
  );
}
