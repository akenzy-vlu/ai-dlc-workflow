import { ConstructionPlan } from '../../construction/domain/model/construction-plan';
import { FeaturePlan } from '../../planning/domain/model/feature-plan';
import { GateState } from '../../governance/domain/model/gate-state';
import { TrackedRepository } from '../../portfolio/domain/model/tracked-repository';

/**
 * One feature seen from all three contexts at once.
 *
 * This is the read model, and it is disposable in exactly the sense
 * `project_registry.py` means: throw it away, re-read the files, get the same thing. It
 * exists because no single file answers "where does this feature stand" — the gate is in
 * one file, the assumptions in another, the ticket statuses spread across forty more.
 *
 * Nothing writes through a snapshot. The write model is the files.
 */
export interface FeatureSnapshot {
  repository: TrackedRepository;
  gateState: GateState;
  plan: FeaturePlan;
  construction: ConstructionPlan;
  /** Directory mtime, for the freshness column. */
  observedAt: Date;
}

export function snapshotKey(repositoryId: string, slug: string): string {
  return `${repositoryId}/${slug}`;
}
