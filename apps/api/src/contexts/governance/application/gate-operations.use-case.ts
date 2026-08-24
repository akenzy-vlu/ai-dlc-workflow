import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'node:path';

import { Gate } from '../../../shared/kernel';
import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import { GateVerdictCache } from '../../insight/application/gate-verdict.cache';
import { FeatureSnapshotAssembler } from '../../insight/application/feature-snapshot.assembler';
import { GATE_CONTROLLER, GateCommandOutcome, GateControllerPort } from '../domain/ports/gate-controller.port';
import { GateVerdict } from '../domain/model/gate-verdict';

export interface GateTarget {
  repositoryId: string;
  slug: string;
  gate: string;
}

/**
 * The write path for gates. Three lines of real work each, and that is the point.
 *
 * The console decides nothing here — it resolves a path, calls the controller, and
 * invalidates its own caches. If `aidlc.py` refuses, the refusal is what the user sees,
 * word for word, because the refusal usually names the exact file to go fix.
 */
@Injectable()
export class GateOperations {
  constructor(
    @Inject(GATE_CONTROLLER) private readonly controller: GateControllerPort,
    private readonly repositories: RepositoryMaintenance,
    private readonly verdicts: GateVerdictCache,
    private readonly assembler: FeatureSnapshotAssembler,
  ) {}

  async check(target: GateTarget): Promise<GateVerdict> {
    const { featureDirectory, featureKey, gate } = await this.resolve(target);
    return this.verdicts.check(featureKey, featureDirectory, gate);
  }

  async pass(target: GateTarget, by: string): Promise<GateCommandOutcome> {
    if (!by.trim()) throw new BadRequestException('`by` is required — a gate is approved by a person, not by a click');
    const { featureDirectory, featureKey, gate } = await this.resolve(target);
    const outcome = await this.controller.pass(featureDirectory, gate, by.trim());
    this.forget(featureKey, target);
    return outcome;
  }

  async reopen(target: GateTarget, by: string, reason: string): Promise<GateCommandOutcome> {
    if (!by.trim()) throw new BadRequestException('`by` is required');
    if (!reason.trim()) throw new BadRequestException('`reason` is required — reopening a gate goes on the record');
    const { featureDirectory, featureKey, gate } = await this.resolve(target);
    const outcome = await this.controller.reopen(featureDirectory, gate, by.trim(), reason.trim());
    this.forget(featureKey, target);
    return outcome;
  }

  /** Re-checks the next gate of every managed feature, in the background. */
  async sweep(onProgress?: (done: number, total: number) => void): Promise<number> {
    const snapshots = await this.assembler.assembleAll();
    const targets = snapshots
      .filter((s) => s.gateState.managed && s.gateState.nextGate)
      .map((s) => ({
        featureKey: s.gateState.ref.key,
        featureDirectory: path.join(s.repository.featuresDirectory, s.gateState.ref.slug.value),
        gate: s.gateState.nextGate!,
      }));
    return this.verdicts.sweep(targets, onProgress);
  }

  private async resolve(target: GateTarget): Promise<{ featureDirectory: string; featureKey: string; gate: Gate }> {
    const repository = await this.repositories.require(target.repositoryId);
    const gate = Gate.create(target.gate);
    if (gate.isNone) throw new BadRequestException(`"${target.gate}" is not a gate`);
    const featureDirectory = path.join(repository.featuresDirectory, target.slug);
    const snapshot = await this.assembler.assembleById(target.repositoryId, target.slug);
    if (!snapshot) throw new NotFoundException(`feature not found: ${target.repositoryId}/${target.slug}`);
    return { featureDirectory, featureKey: snapshot.gateState.ref.key, gate };
  }

  private forget(featureKey: string, target: GateTarget): void {
    this.verdicts.invalidate(featureKey);
    this.assembler.invalidate(target.repositoryId, target.slug);
  }
}
