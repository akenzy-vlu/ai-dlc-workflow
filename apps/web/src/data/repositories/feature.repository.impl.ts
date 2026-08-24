import { skipToken } from '@reduxjs/toolkit/query/react';

import type { FeatureRepository } from '@domain/repositories';
import {
  useCheckGateMutation,
  useCreateFeatureMutation,
  useGetFeatureDocumentQuery,
  useGetFeatureQuery,
  useLintTouchesMutation,
  usePassGateMutation,
  useRegenerateArtifactsMutation,
  useReopenGateMutation,
  useTransitionTicketMutation,
  useValidateGraphMutation,
} from '../datasource/remote';
import { adaptCommand, adaptQuery } from './adapt';

export const featureRepository: FeatureRepository = {
  // `skipToken` rather than `{ skip: true }`: it also narrows the argument type, so a
  // component cannot accidentally pass a half-built ref and have it fetched.
  useFeature: (ref) => adaptQuery(useGetFeatureQuery(ref ?? skipToken)),

  useDocument: (ref, name) =>
    adaptQuery(useGetFeatureDocumentQuery(ref && name ? { ...ref, name } : skipToken)),

  useCheckGate: () => {
    const [trigger, state] = useCheckGateMutation();
    return adaptCommand(trigger, state);
  },
  usePassGate: () => {
    const [trigger, state] = usePassGateMutation();
    return adaptCommand(trigger, state);
  },
  useReopenGate: () => {
    const [trigger, state] = useReopenGateMutation();
    return adaptCommand(trigger, state);
  },
  useTransitionTicket: () => {
    const [trigger, state] = useTransitionTicketMutation();
    return adaptCommand(trigger, state);
  },
  useRegenerate: () => {
    const [trigger, state] = useRegenerateArtifactsMutation();
    return adaptCommand(trigger, state);
  },
  useValidateGraph: () => {
    const [trigger, state] = useValidateGraphMutation();
    return adaptCommand(trigger, state);
  },
  useLintTouches: () => {
    const [trigger, state] = useLintTouchesMutation();
    return adaptCommand(trigger, state);
  },
  useCreateFeature: () => {
    const [trigger, state] = useCreateFeatureMutation();
    return adaptCommand(trigger, state);
  },
};
