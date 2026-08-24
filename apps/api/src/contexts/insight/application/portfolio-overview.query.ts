import { Injectable } from '@nestjs/common';

import { Query } from '../../../shared/application/use-case';
import { FeatureSnapshot } from '../domain/feature-snapshot';
import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import { Project } from '../../portfolio/domain/model/project';
import { FeatureSnapshotAssembler } from './feature-snapshot.assembler';
import { GateVerdictCache } from './gate-verdict.cache';
import { PortfolioRow, PortfolioSummary } from './read-models';

export interface PortfolioResult {
  rows: PortfolioRow[];
  summary: PortfolioSummary;
}

@Injectable()
export class PortfolioOverviewQuery implements Query<void, PortfolioResult> {
  constructor(
    private readonly assembler: FeatureSnapshotAssembler,
    private readonly verdicts: GateVerdictCache,
    private readonly repositories: RepositoryMaintenance,
  ) {}

  async execute(): Promise<PortfolioResult> {
    const [snapshots, projectIndex] = await Promise.all([
      this.assembler.assembleAll(),
      this.repositories.projectIndex(),
    ]);
    const rows = snapshots.map((snapshot) =>
      this.toRow(snapshot, projectIndex.get(snapshot.repository.id.value)),
    );
    return { rows, summary: this.summarise(snapshots, rows) };
  }

  private toRow(snapshot: FeatureSnapshot, project: Project | undefined): PortfolioRow {
    const { repository, gateState, plan, construction } = snapshot;
    const criticalPath = construction.graph.criticalPath();
    const nextGate = gateState.nextGate;
    const verdict = nextGate ? this.verdicts.peek(gateState.ref.key, nextGate) : null;

    return {
      repositoryId: repository.id.value,
      repositoryLabel: repository.label,
      projectKey: project?.key ?? `path:${repository.absolutePath}`,
      projectLabel: project?.label ?? repository.label,
      branch: repository.git?.branch ?? null,
      slug: gateState.ref.slug.value,
      managed: gateState.managed,
      gate: gateState.currentGate.value,
      gateTitle: gateState.currentGate.title,
      nextGate: nextGate?.value ?? null,
      profile: gateState.profile,
      unitOfWorkCount: construction.unitsOfWork.length,
      ticketCount: construction.tickets.length,
      ticketsDone: construction.doneTicketCount,
      ticketsInReview: construction.awaitingReview.length,
      ticketsInProgress: construction.inProgressTicketCount,
      ticketsBlocked: construction.blockedTickets.length,
      progress: construction.progressRatio,
      effortHours: construction.totalEffort.hours,
      remainingHours: construction.remainingEffort.hours,
      criticalPathHours: criticalPath.total.hours,
      blockingAssumptionsOpen: plan.blockingOpenAssumptions.length,
      unresolvedAdrs: plan.unresolvedDecisions.length,
      acceptanceCriteriaCount: plan.acceptanceCriteria.length,
      acceptanceCriteriaUncovered: construction.uncoveredCriteria(plan.acceptanceCriteriaIds).length,
      writeConflicts: construction.graph.writeConflicts().length,
      // Construction is locked below G3, so a "ready" ticket there is not pickable —
      // the gate is the point, and reporting it as available would undo it.
      readyTicketCount: gateState.isConstructionUnlocked ? construction.graph.readyTickets().length : 0,
      nextGateVerdict: verdict ? (verdict.passed ? 'pass' : 'fail') : null,
      loadErrorCount: construction.loadErrors.length,
      plansLocalOnly: repository.plansAreLocalOnly,
      lastActivityAt: gateState.lastActivityAt?.toISOString() ?? null,
      observedAt: snapshot.observedAt.toISOString(),
    };
  }

  private summarise(snapshots: FeatureSnapshot[], rows: PortfolioRow[]): PortfolioSummary {
    const gateHistogram: Record<string, number> = {};
    for (const row of rows) {
      const bucket = row.managed ? row.gate : 'unmanaged';
      gateHistogram[bucket] = (gateHistogram[bucket] ?? 0) + 1;
    }

    return {
      projects: new Set(rows.map((r) => r.projectKey)).size,
      repositories: new Set(rows.map((r) => r.repositoryId)).size,
      features: rows.length,
      managedFeatures: rows.filter((r) => r.managed).length,
      unmanagedFeatures: rows.filter((r) => !r.managed).length,
      tickets: rows.reduce((sum, r) => sum + r.ticketCount, 0),
      ticketsDone: rows.reduce((sum, r) => sum + r.ticketsDone, 0),
      ticketsReady: rows.reduce((sum, r) => sum + r.readyTicketCount, 0),
      ticketsInReview: rows.reduce((sum, r) => sum + r.ticketsInReview, 0),
      blockingAssumptionsOpen: rows.reduce((sum, r) => sum + r.blockingAssumptionsOpen, 0),
      gateHistogram,
      remainingHours: snapshots
        .filter((s) => !s.gateState.isClosed)
        .reduce((sum, s) => sum + s.construction.remainingEffort.hours, 0),
    };
  }
}
