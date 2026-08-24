import type { ControllerOutcome, CreatedFeature, FeatureDetail, GateVerdict, IntentDraft } from '../entities';
import type { TicketAction } from '../enums';
import type { FeatureRef } from '../value-objects';
import type { CommandResult, QueryResult } from './query.types';

/**
 * One feature, read and acted on.
 *
 * Every command here is a controller subprocess on the other side. None of them decides
 * anything: they invoke `aidlc.py` or `uow_graph.py` and hand back what it said, refusals
 * included, because a refusal usually names the file to go and fix.
 */
export interface FeatureRepository {
  useFeature(ref: FeatureRef | null): QueryResult<FeatureDetail>;
  useDocument(ref: FeatureRef | null, name: string | null): QueryResult<{ name: string; content: string }>;

  useCheckGate(): CommandResult<FeatureRef & { gate: string }, GateVerdict>;
  usePassGate(): CommandResult<FeatureRef & { gate: string; by: string }, ControllerOutcome>;
  useReopenGate(): CommandResult<
    FeatureRef & { gate: string; by: string; reason: string },
    ControllerOutcome
  >;

  useTransitionTicket(): CommandResult<
    FeatureRef & {
      ticketId: string;
      action: TicketAction;
      by: string;
      reason?: string;
      /** Skips review. The controller records the bypass in the audit trail. */
      noReview?: boolean;
    },
    ControllerOutcome
  >;

  /** `uow_graph.py --write`. Never hand-edit the three files this regenerates. */
  useRegenerate(): CommandResult<FeatureRef, ControllerOutcome>;
  useValidateGraph(): CommandResult<FeatureRef, ControllerOutcome>;
  useLintTouches(): CommandResult<FeatureRef, ControllerOutcome>;

  useCreateFeature(): CommandResult<
    { repositoryId: string; slug: string; profile?: string; intent?: IntentDraft },
    CreatedFeature
  >;
}
