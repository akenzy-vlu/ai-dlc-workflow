import { useMemo } from 'react';

import { GATE_ORDER, GATE_SHORT_TITLES } from '@domain/enums';
import type { GateStep, GateTimelineProps } from './gate-timeline.props';
import { GateTimelineView } from './gate-timeline.view';

export function GateTimeline({ current, onSelect, selected }: GateTimelineProps) {
  const steps = useMemo<GateStep[]>(() => {
    const currentIndex = current === 'none' ? -1 : GATE_ORDER.indexOf(current);
    return GATE_ORDER.map((gate, index) => ({
      gate,
      title: GATE_SHORT_TITLES[gate],
      passed: index <= currentIndex,
      isNext: index === currentIndex + 1,
      isSelected: selected === gate,
    }));
  }, [current, selected]);

  return <GateTimelineView steps={steps} onSelect={onSelect} />;
}
