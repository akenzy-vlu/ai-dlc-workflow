import { useState } from 'react';

import type { Ticket } from '@domain/entities';
import { AgentRunDrawer, LaunchAgentModal, LaunchReadyModal } from '@presentation/features/agent-launcher';
import { formatDateTime } from '@shared/lib/format';
import { pickable } from '@presentation/features/agent-launcher/launch-ready-modal/launch-ready-modal';
import type { GateVerdictPanelProps } from './gate-verdict-panel.props';
import { GateVerdictPanelView } from './gate-verdict-panel.view';

export function GateVerdictPanel({ verdict, feature }: GateVerdictPanelProps) {
  const [launchFor, setLaunchFor] = useState<Ticket | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [launchingAll, setLaunchingAll] = useState(false);

  if (!verdict) return null;

  return (
    <>
      <GateVerdictPanelView
        verdict={verdict}
        checkedAtLabel={formatDateTime(verdict.checkedAt)}
        ticketFor={(message) => ticketNamedIn(message, feature.tickets)}
        onLaunch={setLaunchFor}
        pickableCount={pickable(feature.tickets).length}
        onLaunchAll={() => setLaunchingAll(true)}
      />

      <LaunchReadyModal
        open={launchingAll}
        repositoryId={feature.repositoryId}
        slug={feature.slug}
        tickets={feature.tickets}
        onClose={() => setLaunchingAll(false)}
      />

      {launchFor ? (
        <LaunchAgentModal
          open
          onClose={() => setLaunchFor(null)}
          repositoryId={feature.repositoryId}
          slug={feature.slug}
          ticketId={launchFor.id}
          ticketTitle={launchFor.title}
          onLaunched={(runId) => setOpenRunId(runId)}
        />
      ) : null}

      <AgentRunDrawer runId={openRunId} onClose={() => setOpenRunId(null)} />
    </>
  );
}

/**
 * Finds which ticket a finding is talking about.
 *
 * Longest id first, and only on a boundary: with ids like `T-01-01` and `T-01-010` in the
 * same feature, a plain `includes` would attribute the second one's finding to the first
 * and offer to start the wrong ticket.
 */
function ticketNamedIn(message: string, tickets: Ticket[]): Ticket | null {
  const byLength = [...tickets].sort((a, b) => b.id.length - a.id.length);
  return byLength.find((ticket) => namesId(message, ticket.id)) ?? null;
}

function namesId(message: string, id: string): boolean {
  const at = message.indexOf(id);
  if (at === -1) return false;
  const after = message[at + id.length];
  // A trailing `-` or alphanumeric means this is a longer id that merely starts the same.
  return after === undefined || !/[\w-]/.test(after);
}
