import type { SetupStep } from '@domain/entities';

export interface SetupStepRowProps {
  step: SetupStep;
  state?: 'running' | 'done' | 'failed';
  /** When the runner is already ready, every step reads as done without a live report. */
  ready: boolean;
}

export interface SetupStepRowViewProps {
  title: string;
  detail: string;
  state: 'running' | 'done' | 'failed' | 'pending';
}
