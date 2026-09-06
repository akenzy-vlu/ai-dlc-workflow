import { Injectable, NotFoundException } from '@nestjs/common';

import { Query } from '../../../shared/application/use-case';
import { FeatureSnapshot } from '../domain/feature-snapshot';
import { FeatureSnapshotAssembler } from './feature-snapshot.assembler';
import { GateVerdictCache } from './gate-verdict.cache';
import { FeatureDetail } from './read-models';

export interface FeatureDetailInput {
  repositoryId: string;
  slug: string;
}

/** Everything one feature page needs, assembled once so the client makes a single call. */
@Injectable()
export class FeatureDetailQuery implements Query<FeatureDetailInput, FeatureDetail> {
  constructor(
    private readonly assembler: FeatureSnapshotAssembler,
    private readonly verdicts: GateVerdictCache,
  ) {}

  async execute(input: FeatureDetailInput): Promise<FeatureDetail> {
    const snapshot = await this.assembler.assembleById(input.repositoryId, input.slug);
    if (!snapshot) throw new NotFoundException(`feature not found: ${input.repositoryId}/${input.slug}`);
    return this.present(snapshot);
  }

  private present(snapshot: FeatureSnapshot): FeatureDetail {
    const { repository, gateState, plan, construction } = snapshot;
    const graph = construction.graph;
    const { waves, cycle } = graph.waves();
    const criticalPath = graph.criticalPath();
    const onCriticalPath = new Set(criticalPath.ticketIds);
    const readyIds = new Set(
      gateState.isConstructionUnlocked ? graph.readyTickets().map((t) => t.id.value) : [],
    );
    const coverage = new Map(
      construction.coverageOf(plan.acceptanceCriteriaIds).map((c) => [c.ac, c.ticketIds]),
    );
    const nextGate = gateState.nextGate;
    const verdict = nextGate ? this.verdicts.peek(gateState.ref.key, nextGate) : null;

    // Last actor to move each ticket into review. History is append-only and ordered, so
    // the last matching entry wins.
    const submittedBy = new Map<string, string>();
    for (const entry of gateState.history) {
      if (entry.ticket && entry.action === 'ticket review') submittedBy.set(entry.ticket, entry.by);
    }

    return {
      repositoryId: repository.id.value,
      repositoryLabel: repository.label,
      repositoryPath: repository.absolutePath,
      slug: gateState.ref.slug.value,
      directory: plan.directory,
      managed: gateState.managed,
      profile: gateState.profile,
      gate: gateState.currentGate.value,
      gateTitle: gateState.currentGate.title,
      nextGate: nextGate?.value ?? null,
      nextGateTitle: nextGate?.title ?? null,
      createdAt: gateState.createdAt?.toISOString() ?? null,
      constructionUnlocked: gateState.isConstructionUnlocked,
      layerVocabulary: [...repository.settings.layers],
      ruleset: repository.settings.ruleset,

      intent: {
        present: plan.intent.present,
        missingSections: plan.intent.missingSections,
        todoCount: plan.intent.todoCount,
        problem: plan.intent.problem,
        successSignal: plan.intent.successSignal,
        outOfScope: plan.intent.outOfScope,
      },
      architectureMap: plan.architectureMap,

      assumptions: plan.assumptions.map((a) => ({
        id: a.id,
        text: a.text,
        confidence: a.confidence,
        blocking: a.isBlocking,
        blastRadius: a.blastRadius,
        status: a.status.value,
        resolution: a.resolution,
        isOpen: a.status.isOpen,
        isUnjustified: a.isUnjustified,
      })),

      acceptanceCriteria: plan.acceptanceCriteria.map((ac) => ({
        id: ac.id,
        title: ac.title,
        story: ac.story,
        gherkin: ac.gherkin,
        coveredBy: coverage.get(ac.id) ?? [],
      })),

      design: {
        present: plan.design.present,
        missingSections: plan.design.missingSections,
        todoCount: plan.design.todoCount,
        approach: plan.design.approach,
      },
      decisions: plan.decisions.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        unresolved: d.isUnresolved,
      })),

      unitsOfWork: construction.unitsOfWork.map((uow) => {
        const tickets = construction.ticketsOf(uow.id);
        return {
          id: uow.id.value,
          title: uow.title,
          slug: uow.slug,
          status: uow.status.value,
          risk: uow.risk.value,
          demoable: uow.isDemoable,
          duration: uow.duration,
          dependsOn: uow.dependsOn.map((d) => d.value),
          verifies: [...uow.verifies],
          rollback: uow.rollback,
          hasDemoScript: uow.demoScript !== null,
          demoScript: uow.demoScript,
          definitionOfDone: uow.definitionOfDone.map((i) => ({ text: i.text, done: i.done })),
          ticketIds: tickets.map((t) => t.id.value),
          effortHours: tickets.reduce((sum, t) => sum + t.estimate.hours, 0),
          doneCount: tickets.filter((t) => t.status.isDone).length,
        };
      }),

      tickets: construction.tickets.map((ticket) => ({
        id: ticket.id.value,
        uow: ticket.uow?.value ?? null,
        title: ticket.title,
        layer: ticket.layer.name,
        layerDeclared: ticket.layer.isDeclared,
        type: ticket.type.value,
        estimateHours: ticket.estimate.hours,
        estimateLabel: ticket.estimate.toString(),
        status: ticket.status.value,
        dependsOn: ticket.dependsOn.map((d) => d.value),
        blocks: ticket.blocks.map((b) => b.value),
        verifies: [...ticket.verifies],
        touches: [...ticket.touches],
        assumptions: [...ticket.assumptions],
        doneWhen: ticket.doneWhen.map((i) => ({ text: i.text, done: i.done })),
        context: ticket.context,
        implementationNotes: ticket.implementationNotes,
        unmetDependencies: graph.unmetDependencyCount(ticket),
        ready: readyIds.has(ticket.id.value),
        onCriticalPath: onCriticalPath.has(ticket.id.value),
        filePath: ticket.filePath,
        parseError: ticket.parseError,
        lastSubmittedBy: submittedBy.get(ticket.id.value) ?? null,
      })),

      graph: {
        waves,
        cycle,
        criticalPath: criticalPath.ticketIds,
        criticalPathHours: criticalPath.total.hours,
        totalEffortHours: construction.totalEffort.hours,
        remainingHours: construction.remainingEffort.hours,
        writeConflicts: graph.writeConflicts(),
        danglingReferences: graph.danglingReferences(),
      },

      history: gateState.history.map((h) => ({
        gate: h.gate.value,
        action: h.action,
        at: h.at?.toISOString() ?? null,
        by: h.by,
        ticket: h.ticket,
        reason: h.reason,
        evidence: h.evidence,
      })),

      loadErrors: [...construction.loadErrors],
      documents: [...plan.documents],

      gateVerdict: verdict
        ? {
            gate: verdict.gate.value,
            passed: verdict.passed,
            checkedAt: verdict.checkedAt.toISOString(),
            error: verdict.error,
            findings: verdict.findings.map((f) => ({ level: f.level, message: f.message })),
          }
        : null,
    };
  }
}
