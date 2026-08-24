import { FeatureRef } from '../../../../shared/kernel';
import { FeaturePlan } from '../model/feature-plan';

export const FEATURE_PLAN_READER = Symbol('FEATURE_PLAN_READER');

export interface FeaturePlanReaderPort {
  /**
   * @param featureDirectory absolute path to `.ai/features/<slug>`
   * @param repoRoot absolute path to the checkout, for `.ai/architecture.md`
   */
  read(ref: FeatureRef, featureDirectory: string, repoRoot: string): Promise<FeaturePlan>;
  /** Raw markdown of one artifact, for the document viewer. Null when absent. */
  readDocument(featureDirectory: string, filename: string): Promise<string | null>;
}
