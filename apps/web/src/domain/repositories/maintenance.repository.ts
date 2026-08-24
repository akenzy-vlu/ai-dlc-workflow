import type { ActingIdentityMode, ToolingStatus } from '../entities';
import type { CommandResult, QueryResult } from './query.types';

export interface MaintenanceRepository {
  useStatus(): QueryResult<{
    tooling: ToolingStatus;
    cachedGateVerdicts: number;
    sweeping: boolean;
    identity: ActingIdentityMode;
  }>;
  /** Drops every cache. The read model is disposable by design. */
  useRefresh(): CommandResult<void, { refreshed: boolean }>;
  /** Runs `aidlc check` for every managed feature's next gate, in the background. */
  useSweepGates(): CommandResult<void, { started: boolean; reason?: string }>;
}
