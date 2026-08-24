import { GateVerdict } from '../model/gate-verdict';
import { Gate } from '../../../../shared/kernel';

export const GATE_CONTROLLER = Symbol('GATE_CONTROLLER');

export interface GateCommandOutcome {
  accepted: boolean;
  output: string;
  command: string;
  exitCode: number;
}

/** Delegation to `aidlc.py`. Nothing here interprets a gate rule; it only invokes one. */
export interface GateControllerPort {
  /**
   * `aidlc init <slug>`: scaffolds the feature directory and its state file.
   *
   * Creating a feature by writing the files directly would be easy and would be the first
   * crack: the state file carries a header saying it is controller-managed, and a plan
   * whose state file the console authored is a plan the console could author again.
   */
  init(featureDirectory: string, slug: string, profile: string | null): Promise<GateCommandOutcome>;
  check(featureDirectory: string, gate: Gate): Promise<GateVerdict>;
  pass(featureDirectory: string, gate: Gate, by: string): Promise<GateCommandOutcome>;
  reopen(featureDirectory: string, gate: Gate, by: string, reason: string): Promise<GateCommandOutcome>;
  /** `aidlc snapshot`: the portable JSON the collector ingests. */
  snapshot(featureDirectory: string, repoRoot: string, label: string): Promise<unknown | null>;
}
