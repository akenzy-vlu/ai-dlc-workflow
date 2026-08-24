import { GATE_COLORS } from '@app/theme';
import { GATE_TITLES } from '@domain/enums';
import type { GateTagProps } from './gate-tag.props';
import { GateTagView } from './gate-tag.view';

export function GateTag({ gate, managed = true }: GateTagProps) {
  if (!managed) {
    return (
      <GateTagView
        label="unmanaged"
        tooltip="No .aidlc-state.yaml — this plan is outside the controller entirely"
        color={undefined}
        dashed
      />
    );
  }

  return (
    <GateTagView
      label={gate === 'none' ? 'pre-G0' : gate}
      tooltip={GATE_TITLES[gate]}
      color={GATE_COLORS[gate]}
      dashed={false}
    />
  );
}
