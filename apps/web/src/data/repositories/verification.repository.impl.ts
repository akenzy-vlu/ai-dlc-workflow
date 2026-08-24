import { skipToken } from '@reduxjs/toolkit/query/react';

import type { RunnerRepository, VerificationRepository } from '@domain/repositories';
import {
  artifactUrl,
  blobUrl,
  useCheckEvidenceMutation,
  useCreateEvidenceArchiveMutation,
  useGetEvidenceArchiveQuery,
  useGetRunnerQuery,
  useGetVerificationQuery,
  useInstallRunnerMutation,
  useRunVerificationMutation,
  useUseInterpreterMutation,
} from '../datasource/remote';
import { adaptCommand, adaptQuery } from './adapt';

export const verificationRepository: VerificationRepository = {
  useVerification: (ref) => adaptQuery(useGetVerificationQuery(ref ?? skipToken)),
  useRunVerification: () => {
    const [trigger, state] = useRunVerificationMutation();
    return adaptCommand(trigger, state);
  },
  useCheckEvidence: () => {
    const [trigger, state] = useCheckEvidenceMutation();
    return adaptCommand(trigger, state);
  },
  artifactUrl,

  useArchive: (ref) => adaptQuery(useGetEvidenceArchiveQuery(ref ?? skipToken)),
  useCreateArchive: () => {
    const [trigger, state] = useCreateEvidenceArchiveMutation();
    return adaptCommand(trigger, state);
  },
  blobUrl,
};

export const runnerRepository: RunnerRepository = {
  useRunner: () => adaptQuery(useGetRunnerQuery()),
  useInstallRunner: () => {
    const [trigger, state] = useInstallRunnerMutation();
    return adaptCommand(() => trigger(), state);
  },
  useUseInterpreter: () => {
    const [trigger, state] = useUseInterpreterMutation();
    return adaptCommand(trigger, state);
  },
};
