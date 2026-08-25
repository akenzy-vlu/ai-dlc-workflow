export const FEATURE_SCAFFOLD_WRITER = Symbol('FEATURE_SCAFFOLD_WRITER');

export interface IntentDraft {
  problem: string;
  successSignal: string;
  outOfScope: string[];
  constraints: string;
}

/**
 * Writes the intent document *once*, immediately after `aidlc init`, and only while it is
 * still the untouched scaffold.
 *
 * This is the one place the console writes a plan file directly, and the boundary is
 * exact: `00-intent.md` is authored content, not gate state, and at this moment it
 * contains nothing but `TODO` placeholders the controller itself just wrote. Refusing to
 * overwrite anything else is what keeps this from becoming a general-purpose plan editor
 * fighting every other author of the file.
 */
export interface FeatureScaffoldWriterPort {
  /**
   * `feature` is the bare name, not the dated directory — it titles the document, the
   * same way `aidlc init` writes it.
   *
   * Returns false, writing nothing, if the file has already been edited.
   */
  writeIntent(featureDirectory: string, feature: string, draft: IntentDraft): Promise<boolean>;
}
