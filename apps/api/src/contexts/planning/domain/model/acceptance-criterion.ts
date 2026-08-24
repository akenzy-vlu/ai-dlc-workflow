import { Entity } from '../../../../shared/kernel';

/**
 * An `AC-nn` from `02-requirements.md`, and which tickets claim to verify it.
 *
 * Coverage is not decided here — the tickets live in the construction context — so the
 * criterion carries only what requirements state. The join happens in the read model,
 * the same way `06-traceability.md` is generated rather than hand-maintained.
 */
export class AcceptanceCriterion extends Entity<string> {
  private constructor(
    id: string,
    readonly title: string,
    readonly story: string | null,
    readonly gherkin: string | null,
  ) {
    super(id);
  }

  static create(params: { id: string; title: string; story?: string | null; gherkin?: string | null }): AcceptanceCriterion {
    return new AcceptanceCriterion(params.id, params.title, params.story ?? null, params.gherkin ?? null);
  }
}
