import { Entity } from '../../../../shared/kernel';
import { normaliseCell } from '../../../../shared/infrastructure/text/markdown.reader';

export const ADR_STATUSES = ['proposed', 'accepted', 'rejected', 'superseded', 'unknown'] as const;
export type AdrStatusValue = (typeof ADR_STATUSES)[number];

/**
 * An `### ADR-nn` block in `03-logical-design.md`.
 *
 * G2 will not pass while any ADR is still `proposed`, and neither will G5. That is the
 * rule that stops a design shipping with its hard decision left as an open question.
 */
export class ArchitectureDecision extends Entity<string> {
  private constructor(
    id: string,
    readonly title: string,
    readonly status: AdrStatusValue,
    readonly body: string,
  ) {
    super(id);
  }

  static create(params: { id: string; title: string; status?: string; body?: string }): ArchitectureDecision {
    const normalised = normaliseCell(params.status ?? '');
    const status = (ADR_STATUSES as readonly string[]).includes(normalised)
      ? (normalised as AdrStatusValue)
      : 'unknown';
    return new ArchitectureDecision(params.id, params.title, status, params.body ?? '');
  }

  get isUnresolved(): boolean {
    return this.status === 'proposed';
  }
}
