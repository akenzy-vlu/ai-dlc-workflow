import type {
  ControllerOutcome,
  CreatedFeature,
  FeatureDetail,
  FeatureSummary,
  GateVerdict,
  Portfolio,
  Ticket,
  UnitOfWork,
} from '@domain/entities';
import { GATE_TITLES } from '@domain/enums';
import type {
  ControllerOutcomeModel,
  CreatedFeatureModel,
  FeatureDetailModel,
  FeatureSummaryModel,
  GateVerdictModel,
  PortfolioModel,
  TicketModel,
  UnitOfWorkModel,
} from '../models';
import { toGate, toNextGate, toWorkStatus } from './enum.mapper';

export const toFeatureSummary = (model: FeatureSummaryModel): FeatureSummary => {
  const gate = toGate(model.gate);
  return {
    ...model,
    gate,
    // The server sends a title too, but deriving it from the narrowed gate keeps the two
    // from disagreeing when an unknown gate string falls back to `none`.
    gateTitle: GATE_TITLES[gate],
    nextGate: toNextGate(model.nextGate),
  };
};

export const toPortfolio = (model: PortfolioModel): Portfolio => ({
  rows: (model.rows ?? []).map(toFeatureSummary),
  summary: model.summary,
});

const toUnitOfWork = (model: UnitOfWorkModel): UnitOfWork => ({
  ...model,
  status: toWorkStatus(model.status),
});

const toTicket = (model: TicketModel): Ticket => ({
  ...model,
  status: toWorkStatus(model.status),
  lastSubmittedBy: model.lastSubmittedBy ?? null,
});

export const toGateVerdict = (model: GateVerdictModel): GateVerdict => ({
  ...model,
  gate: toGate(model.gate),
});

export const toFeatureDetail = (model: FeatureDetailModel): FeatureDetail => ({
  ...model,
  gate: toGate(model.gate),
  nextGate: toNextGate(model.nextGate),
  unitsOfWork: (model.unitsOfWork ?? []).map(toUnitOfWork),
  tickets: (model.tickets ?? []).map(toTicket),
  history: (model.history ?? []).map((entry) => ({ ...entry, gate: toGate(entry.gate) })),
  gateVerdict: model.gateVerdict ? toGateVerdict(model.gateVerdict) : null,
});

export const toControllerOutcome = (model: ControllerOutcomeModel): ControllerOutcome => ({ ...model });

export const toCreatedFeature = (model: CreatedFeatureModel): CreatedFeature => ({ ...model });
