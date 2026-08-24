import { useState } from 'react';
import { App } from 'antd';

import { verificationRepository } from '@data/repositories';
import type { ControllerOutcome } from '@domain/entities';
import type { VerificationPanelProps } from './verification-panel.props';
import { VerificationPanelView } from './verification-panel.view';

export function VerificationPanel({ repositoryId, slug }: VerificationPanelProps) {
  const { message } = App.useApp();
  const ref = { repositoryId, slug };
  const verification = verificationRepository.useVerification(ref);
  const run = verificationRepository.useRunVerification();
  const checkEvidence = verificationRepository.useCheckEvidence();

  const [outcome, setOutcome] = useState<{ title: string; result: ControllerOutcome } | null>(null);
  const [confirmWrite, setConfirmWrite] = useState(false);
  const [acceptWrites, setAcceptWrites] = useState(false);

  return (
    <VerificationPanelView
      repositoryId={repositoryId}
      slug={slug}
      verification={verification.data}
      loading={verification.isLoading}
      running={run.isPending}
      checking={checkEvidence.isPending}
      confirmWriteOpen={confirmWrite}
      acceptWrites={acceptWrites}
      outcome={outcome}
      results={verification.data?.run?.results ?? []}
      artifactUrl={(relativePath) => verificationRepository.artifactUrl(ref, relativePath)}
      onOpenConfirmWrite={() => setConfirmWrite(true)}
      onCloseConfirmWrite={() => setConfirmWrite(false)}
      onAcceptWritesChange={setAcceptWrites}
      onCloseOutcome={() => setOutcome(null)}
      onRun={(write) => {
        void run
          .run({ ...ref, write })
          .then((result) => {
            setOutcome({ title: write ? 'verify.py --write' : 'verify.py', result });
            setConfirmWrite(false);
            setAcceptWrites(false);
          })
          .catch((error: Error) => message.error(error.message));
      }}
      onCheckEvidence={() => {
        void checkEvidence
          .run(ref)
          .then((result) => setOutcome({ title: 'evidence_check.py', result }))
          .catch((error: Error) => message.error(error.message));
      }}
    />
  );
}
