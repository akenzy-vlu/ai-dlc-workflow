import type { AuditRow, Board, BoardCard, Inbox, InboxItem, ReadyTicket, SearchHit } from '@domain/entities';
import type {
  AuditRowModel,
  BoardCardModel,
  BoardModel,
  InboxItemModel,
  InboxModel,
  ReadyTicketModel,
  SearchHitModel,
} from '../models';
import { toGate, toInboxKind, toInboxSeverity, toSearchKind, toWorkStatus } from './enum.mapper';

const toInboxItem = (model: InboxItemModel): InboxItem => ({
  ...model,
  kind: toInboxKind(model.kind),
  severity: toInboxSeverity(model.severity),
});

export const toInbox = (model: InboxModel): Inbox => ({
  items: (model.items ?? []).map(toInboxItem),
  counts: model.counts ?? {},
  featuresWithoutGateCheck: model.featuresWithoutGateCheck ?? 0,
});

export const toReadyTicket = (model: ReadyTicketModel): ReadyTicket => ({
  ...model,
  gate: toGate(model.gate),
});

const toBoardCard = (model: BoardCardModel): BoardCard => ({
  ...model,
  status: toWorkStatus(model.status),
  gate: toGate(model.gate),
  checkouts: (model.checkouts ?? []).map((checkout) => ({
    ...checkout,
    status: toWorkStatus(checkout.status),
  })),
});

export const toBoard = (model: BoardModel): Board => ({
  cards: (model.cards ?? []).map(toBoardCard),
  facets: model.facets ?? [],
  totalBeforeFilters: model.totalBeforeFilters ?? 0,
  scopeLabel: model.scopeLabel ?? '',
});

export const toSearchHit = (model: SearchHitModel): SearchHit => ({
  ...model,
  kind: toSearchKind(model.kind),
});

export const toAuditRow = (model: AuditRowModel): AuditRow => ({
  ...model,
  gate: toGate(model.gate),
});
