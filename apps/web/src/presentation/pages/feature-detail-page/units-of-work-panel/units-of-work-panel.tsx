import { useMemo, useState } from 'react';

import { agentRepository } from '@data/repositories';
import type { AgentRun, Ticket } from '@domain/entities';
import type { UnitsOfWorkPanelProps } from './units-of-work-panel.props';
import { UnitsOfWorkPanelView } from './units-of-work-panel.view';

export function UnitsOfWorkPanel({ feature }: UnitsOfWorkPanelProps) {
  const [launchFor, setLaunchFor] = useState<Ticket | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const runs = agentRepository.useRuns({
    repositoryId: feature.repositoryId,
    slug: feature.slug,
  });

  // Latest run per ticket. A ticket can be handed to an agent more than once — a failed
  // run then a retry — and the newest is the one whose transcript anyone wants.
  const latestRun = useMemo(() => {
    const map = new Map<string, AgentRun>();
    for (const run of runs.data ?? []) {
      const existing = map.get(run.ticketId);
      if (!existing || run.createdAt > existing.createdAt) map.set(run.ticketId, run);
    }
    return map;
  }, [runs.data]);

  const ticketsById = useMemo(
    () => new Map(feature.tickets.map((ticket) => [ticket.id, ticket])),
    [feature.tickets],
  );

  return (
    <UnitsOfWorkPanelView
      repositoryId={feature.repositoryId}
      slug={feature.slug}
      unitsOfWork={feature.unitsOfWork}
      ticketsOf={(uow) =>
        uow.ticketIds.map((id) => ticketsById.get(id)).filter((ticket): ticket is Ticket => Boolean(ticket))
      }
      runFor={(ticketId) => latestRun.get(ticketId)}
      // Finished slices start collapsed; the unfinished ones are what anyone opened for.
      defaultOpenKeys={feature.unitsOfWork.filter((uow) => uow.status !== 'done').map((uow) => uow.id)}
      launchFor={launchFor}
      openRunId={openRunId}
      onLaunch={setLaunchFor}
      onOpenRun={setOpenRunId}
    />
  );
}
