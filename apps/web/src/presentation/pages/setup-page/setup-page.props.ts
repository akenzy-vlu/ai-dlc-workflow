import type { RunnerStatus, ToolingStatus } from '@domain/entities';
import type { SetupStepId } from '@domain/enums';
import type { SetupLogLine } from '@app/store';

export interface SetupPageViewProps {
  runner: RunnerStatus | undefined;
  tooling: ToolingStatus | undefined;
  checking: boolean;
  installing: boolean;
  applyingInterpreter: boolean;
  stepStates: Partial<Record<SetupStepId, 'running' | 'done' | 'failed'>>;
  log: SetupLogLine[];
  logRef: React.RefObject<HTMLDivElement | null>;
  manualPath: string;
  confirmOpen: boolean;
  onManualPathChange: (value: string) => void;
  onUseInterpreter: (path: string) => void;
  onOpenConfirm: () => void;
  onCloseConfirm: () => void;
  onInstall: () => void;
  onRecheck: () => void;
}
