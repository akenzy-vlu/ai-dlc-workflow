import type { AgentRun, Board, BoardCard, Project } from '@domain/entities';
import type { WorkStatus } from '@domain/enums';
import type { DisplayOptions, Grouped, ViewFilter } from '@domain/value-objects';

export interface BoardPageViewProps {
  board: Board | undefined;
  lanes: Grouped<BoardCard>[];
  columns: { status: WorkStatus; label: string; hint: string }[];
  projects: Project[];
  projectsLoading: boolean;
  scope: string;
  filters: ViewFilter[];
  display: DisplayOptions;
  isCustomised: boolean;
  loading: boolean;
  fetching: boolean;
  launchFor: BoardCard | null;
  openRunId: string | null;
  runFor: (card: BoardCard) => AgentRun | undefined;
  onScopeChange: (scope: string) => void;
  onFiltersChange: (filters: ViewFilter[]) => void;
  onDisplayChange: (patch: Partial<DisplayOptions>) => void;
  onResetView: () => void;
  onRefresh: () => void;
  onLaunch: (card: BoardCard | null) => void;
  onOpenRun: (runId: string | null) => void;
}
