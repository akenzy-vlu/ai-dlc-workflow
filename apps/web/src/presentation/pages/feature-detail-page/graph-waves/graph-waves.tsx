import { useMemo } from 'react';

import type { GraphWavesProps, WaveCard } from './graph-waves.props';
import { GraphWavesView } from './graph-waves.view';

export function GraphWaves({ graph, tickets }: GraphWavesProps) {
  const waves = useMemo<WaveCard[][]>(() => {
    const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
    const criticalPath = new Set(graph.criticalPath);
    return graph.waves.map((wave) =>
      wave.map((id) => {
        const ticket = byId.get(id);
        return {
          id,
          title: ticket?.title ?? '-',
          estimateLabel: ticket?.estimateLabel ?? '',
          status: ticket?.status ?? 'todo',
          onCriticalPath: criticalPath.has(id),
        };
      }),
    );
  }, [graph, tickets]);

  return (
    <GraphWavesView
      waves={waves}
      cycle={graph.cycle}
      criticalPathHours={graph.criticalPathHours}
      totalEffortHours={graph.totalEffortHours}
      writeConflicts={graph.writeConflicts}
      empty={graph.waves.length === 0}
    />
  );
}
