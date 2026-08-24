import { FeatureRef } from '../../../../shared/kernel';
import { GateState } from '../model/gate-state';

export const GATE_STATE_READER = Symbol('GATE_STATE_READER');

export interface GateStateReaderPort {
  read(ref: FeatureRef, featureDirectory: string): Promise<GateState>;
}
