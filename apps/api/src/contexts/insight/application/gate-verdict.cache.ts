import { Inject, Injectable, Logger } from '@nestjs/common';

import { Gate } from '../../../shared/kernel';
import { GATE_CONTROLLER, GateControllerPort } from '../../governance/domain/ports/gate-controller.port';
import { GateVerdict } from '../../governance/domain/model/gate-verdict';

interface CachedVerdict {
  verdict: GateVerdict;
  featureDirectory: string;
}

/**
 * Remembers what `aidlc check` last said, per feature.
 *
 * A gate verdict costs a python subprocess that re-parses the whole plan — roughly a
 * third of a second per feature. Running that for a hundred and twenty features to render
 * one page would be indefensible, so the inbox reports only what is already known and
 * says plainly which features have not been checked yet, rather than guessing.
 *
 * A cached verdict is *evidence of a past check*, never a substitute for one: `pass`
 * re-runs the preconditions inside the controller regardless of what is cached here.
 */
@Injectable()
export class GateVerdictCache {
  private readonly logger = new Logger(GateVerdictCache.name);
  private readonly verdicts = new Map<string, CachedVerdict>();
  private sweeping = false;

  constructor(@Inject(GATE_CONTROLLER) private readonly controller: GateControllerPort) {}

  private key(featureKey: string, gate: Gate): string {
    return `${featureKey}::${gate.value}`;
  }

  peek(featureKey: string, gate: Gate): GateVerdict | null {
    return this.verdicts.get(this.key(featureKey, gate))?.verdict ?? null;
  }

  async check(featureKey: string, featureDirectory: string, gate: Gate): Promise<GateVerdict> {
    const verdict = await this.controller.check(featureDirectory, gate);
    this.verdicts.set(this.key(featureKey, gate), { verdict, featureDirectory });
    return verdict;
  }

  /** Re-checks a feature's next gate only if nothing is remembered for it. */
  async ensure(featureKey: string, featureDirectory: string, gate: Gate): Promise<GateVerdict> {
    const cached = this.peek(featureKey, gate);
    return cached ?? this.check(featureKey, featureDirectory, gate);
  }

  invalidate(featureKey: string): void {
    for (const key of this.verdicts.keys()) {
      if (key.startsWith(`${featureKey}::`)) this.verdicts.delete(key);
    }
  }

  clear(): void {
    this.verdicts.clear();
  }

  get isSweeping(): boolean {
    return this.sweeping;
  }

  get size(): number {
    return this.verdicts.size;
  }

  /**
   * Checks many features in the background. The ProcessRunner's concurrency limit does
   * the throttling; this only reports progress and refuses to run twice at once.
   */
  async sweep(
    targets: { featureKey: string; featureDirectory: string; gate: Gate }[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    let done = 0;

    try {
      await Promise.all(
        targets.map(async (target) => {
          try {
            await this.check(target.featureKey, target.featureDirectory, target.gate);
          } catch (error) {
            this.logger.warn(`sweep failed for ${target.featureKey}: ${(error as Error).message}`);
          } finally {
            done++;
            onProgress?.(done, targets.length);
          }
        }),
      );
      return done;
    } finally {
      this.sweeping = false;
    }
  }
}
