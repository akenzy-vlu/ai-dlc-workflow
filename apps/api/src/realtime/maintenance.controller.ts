import { Controller, Get, Post } from '@nestjs/common';

import { identityMode } from '../shared/identity/acting-identity';
import { ToolingProbe } from '../shared/infrastructure/tooling.probe';
import { GateOperations } from '../contexts/governance/application/gate-operations.use-case';
import { FeatureSnapshotAssembler } from '../contexts/insight/application/feature-snapshot.assembler';
import { GateVerdictCache } from '../contexts/insight/application/gate-verdict.cache';
import { PlanEventsGateway } from './plan-events.gateway';
import { PlanWatcherService } from './plan-watcher.service';

@Controller('api/maintenance')
export class MaintenanceController {
  constructor(
    private readonly assembler: FeatureSnapshotAssembler,
    private readonly verdicts: GateVerdictCache,
    private readonly gates: GateOperations,
    private readonly watcher: PlanWatcherService,
    private readonly events: PlanEventsGateway,
    private readonly tooling: ToolingProbe,
  ) {}

  @Get('status')
  async status() {
    const identity = identityMode();
    return {
      tooling: await this.tooling.status(),
      cachedGateVerdicts: this.verdicts.size,
      sweeping: this.verdicts.isSweeping,
      // Whether the names in this repository's audit trail can be attributed to anyone.
      identity: {
        ...identity,
        verified: identity.mode === 'trusted-header',
        note:
          identity.mode === 'trusted-header'
            ? `approvals are attributed from the ${identity.header} header`
            : 'approvals carry whatever name the client sent — fine for one person, not evidence for a team. Set AIDLC_TRUSTED_USER_HEADER behind an authenticating proxy.',
      },
    };
  }

  /** Drops every cache and re-attaches watchers. The read model is disposable by design. */
  @Post('refresh')
  async refresh() {
    this.assembler.invalidate();
    this.verdicts.clear();
    await this.watcher.resync();
    return { refreshed: true };
  }

  /**
   * Runs `aidlc check` for every managed feature's next gate.
   *
   * Returns immediately and reports progress over the socket, because a hundred-plus
   * python subprocesses is tens of seconds of work and holding an HTTP request open for
   * it would just time out somewhere less informative.
   */
  @Post('sweep-gates')
  async sweepGates() {
    if (this.verdicts.isSweeping) return { started: false, reason: 'a sweep is already running' };

    void this.gates
      .sweep((done, total) =>
        this.events.emit({ type: 'gates.sweep', done, total, at: new Date().toISOString() }),
      )
      .catch(() => undefined);

    return { started: true };
  }
}
