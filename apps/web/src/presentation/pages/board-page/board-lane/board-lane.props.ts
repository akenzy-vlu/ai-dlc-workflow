import type { AgentRun, BoardCard } from '@domain/entities';
import type { WorkStatus } from '@domain/enums';
import type { Grouped } from '@domain/value-objects';

export interface BoardLaneProps {
  lane: Grouped<BoardCard>;
  columns: { status: WorkStatus; label: string; hint: string }[];
  orderBy: string;
  properties: string[];
  showEmptyColumns: boolean;
  runFor: (card: BoardCard) => AgentRun | undefined;
  onLaunch: (card: BoardCard) => void;
  onOpenRun: (runId: string) => void;
}

export interface BoardColumnData {
  status: WorkStatus;
  label: string;
  hint: string;
  cards: BoardCard[];
  hours: number;
}

export interface BoardLaneViewProps {
  label: string;
  sublabel: string | null;
  totalCards: number;
  totalHours: number;
  columns: BoardColumnData[];
  properties: string[];
  runFor: (card: BoardCard) => AgentRun | undefined;
  onLaunch: (card: BoardCard) => void;
  onOpenRun: (runId: string) => void;
}
