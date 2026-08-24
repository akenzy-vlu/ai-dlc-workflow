import { useState } from 'react';
import { App } from 'antd';

import { featureRepository, preferencesRepository } from '@data/repositories';
import type { ControllerOutcome } from '@domain/entities';
import { ALLOWED_ACTIONS, type TicketAction } from '@domain/enums';
import { ControllerOutput } from '@presentation/components/controller-output';
import type { TicketActionsProps } from './ticket-actions.props';
import { TicketActionsView } from './ticket-actions.view';

export function TicketActions({
  repositoryId,
  slug,
  ticketId,
  status,
  untickedCount,
  lastSubmittedBy = null,
  compact = false,
}: TicketActionsProps) {
  const { message } = App.useApp();
  const { actor } = preferencesRepository.useActor();
  const transition = featureRepository.useTransitionTicket();

  const [outcome, setOutcome] = useState<ControllerOutcome | null>(null);
  const [pending, setPending] = useState<TicketAction | null>(null);
  const [reason, setReason] = useState('');
  const [noReview, setNoReview] = useState(false);

  const actions = ALLOWED_ACTIONS[status];
  if (actions.length === 0 || !actor) return null;

  const isSelfAccept = Boolean(lastSubmittedBy) && lastSubmittedBy === actor;

  const run = (action: TicketAction, extra: { reason?: string; noReview?: boolean } = {}): void => {
    void transition
      .run({ repositoryId, slug, ticketId, action, by: actor, ...extra })
      .then((result) => {
        setOutcome(result);
        setPending(null);
        setReason('');
      })
      .catch((error: Error) => {
        message.error(error.message);
        setPending(null);
      });
  };

  return (
    <>
      <TicketActionsView
        ticketId={ticketId}
        actions={actions}
        compact={compact}
        pending={pending}
        busy={transition.isPending}
        blockedByChecklist={untickedCount > 0}
        untickedCount={untickedCount}
        isSelfAccept={isSelfAccept}
        lastSubmittedBy={lastSubmittedBy}
        actor={actor}
        reason={reason}
        noReview={noReview}
        onRun={(action) => {
          // `reject` needs a reason, `done` offers a review bypass, and accepting your own
          // submission deserves a beat of hesitation — all three open a dialog.
          if (action === 'reject' || action === 'done' || (action === 'accept' && isSelfAccept)) {
            setPending(action);
            return;
          }
          run(action);
        }}
        onCancel={() => setPending(null)}
        onReasonChange={setReason}
        onNoReviewChange={setNoReview}
        onConfirmReject={() => run('reject', { reason })}
        onConfirmDone={() => run('done', { noReview })}
        onConfirmAccept={() => run('accept')}
      />

      <ControllerOutput
        outcome={outcome}
        title={ticketId}
        open={outcome !== null}
        onClose={() => setOutcome(null)}
      />
    </>
  );
}
