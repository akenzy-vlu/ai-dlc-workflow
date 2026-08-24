import { FeatureRef } from '../../../../shared/kernel';
import { ConstructionPlan } from '../model/construction-plan';

export const CONSTRUCTION_PLAN_READER = Symbol('CONSTRUCTION_PLAN_READER');

export interface ConstructionPlanReaderPort {
  /**
   * @param layerVocabulary from the repo's `.ai/aidlc.yaml`; a ticket naming a layer
   *        outside it is a G3 error, and the console must be able to say which.
   */
  read(ref: FeatureRef, featureDirectory: string, layerVocabulary: readonly string[]): Promise<ConstructionPlan>;
}
