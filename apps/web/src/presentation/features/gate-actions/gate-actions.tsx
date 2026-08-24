import { useState } from 'react';
import { App } from 'antd';

import { featureRepository, preferencesRepository } from '@data/repositories';
import type { ControllerOutcome } from '@domain/entities';
import { ControllerOutput } from '@presentation/components/controller-output';
import { IdentityPrompt } from '@presentation/features/identity';
import type { GateActionsProps } from './gate-actions.props';
import { GateActionsView } from './gate-actions.view';

/**
 * Check, approve, reopen.
 *
 * `check` runs first and separately by design — it changes nothing and reports the exact
 * blockers, so a user can see why a gate will refuse before trying to pass it. Approving
 * still re-runs the preconditions inside the controller; a green check here is evidence,
 * never permission.
 */
export function GateActions({ feature }: GateActionsProps) {
  const { message } = App.useApp();
  const { actor } = preferencesRepository.useActor();
  const check = featureRepository.useCheckGate();
  const pass = featureRepository.usePassGate();
  const reopen = featureRepository.useReopenGate();

  const [outcome, setOutcome] = useState<{ title: string; result: ControllerOutcome } | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [namePrompt, setNamePrompt] = useState(false);

  const ref = { repositoryId: feature.repositoryId, slug: feature.slug };
  const verdictIsForNext = feature.gateVerdict?.gate === feature.nextGate;

  const handle = async (task: Promise<ControllerOutcome>, title: string): Promise<void> => {
    try {
      setOutcome({ title, result: await task });
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  return (
    <>
      <GateActionsView
        managed={feature.managed}
        slug={feature.slug}
        currentGate={feature.gate}
        nextGate={feature.nextGate}
        actor={actor}
        readyToApprove={verdictIsForNext && feature.gateVerdict?.passed === true}
        checking={check.isPending}
        passing={pass.isPending}
        reopening={reopen.isPending}
        reopenOpen={reopenOpen}
        reopenReason={reason}
        onSetName={() => setNamePrompt(true)}
        onCheck={() => {
          if (!feature.nextGate) return;
          void check
            .run({ ...ref, gate: feature.nextGate })
            .then((verdict) => {
              if (verdict.error) message.warning(verdict.error);
              else if (verdict.passed) message.success(`${verdict.gate} preconditions pass`);
              else
                message.info(
                  `${verdict.gate}: ${verdict.findings.filter((f) => f.level === 'fail').length} blocker(s)`,
                );
            })
            .catch((error: Error) => message.error(error.message));
        }}
        onPass={() => {
          if (!feature.nextGate) return;
          void handle(pass.run({ ...ref, gate: feature.nextGate, by: actor }), `Approve ${feature.nextGate}`);
        }}
        onOpenReopen={() => setReopenOpen(true)}
        onCloseReopen={() => setReopenOpen(false)}
        onReopenReasonChange={setReason}
        onReopen={() => {
          void handle(
            reopen.run({ ...ref, gate: feature.gate, by: actor, reason }),
            `Reopen ${feature.gate}`,
          ).then(() => {
            setReopenOpen(false);
            setReason('');
          });
        }}
      />

      <ControllerOutput
        outcome={outcome?.result ?? null}
        title={outcome?.title ?? ''}
        open={outcome !== null}
        onClose={() => setOutcome(null)}
      />
      <IdentityPrompt open={namePrompt} onClose={() => setNamePrompt(false)} />
    </>
  );
}
