import { Injectable } from '@nestjs/common';

import { Query } from '../../../shared/application/use-case';
import { FeatureSnapshotAssembler } from './feature-snapshot.assembler';

export type SearchKind = 'repository' | 'feature' | 'unit-of-work' | 'ticket' | 'criterion' | 'assumption';

export interface SearchHit {
  kind: SearchKind;
  /** Where selecting it navigates to. */
  path: string;
  title: string;
  subtitle: string;
  /** Ticket/UoW/AC id, when the hit has one. */
  badge: string | null;
  repositoryId: string;
  repositoryLabel: string;
  featureSlug: string | null;
  status: string | null;
  score: number;
}

export interface SearchInput {
  term: string;
  limit?: number;
}

const KIND_WEIGHT: Record<SearchKind, number> = {
  repository: 6,
  feature: 5,
  ticket: 4,
  'unit-of-work': 4,
  criterion: 2,
  assumption: 2,
};

/**
 * One search across everything the read model holds.
 *
 * Scored rather than filtered, because the useful query is almost always an id typed from
 * memory — `T-05-02`, `UOW-03`, `AC-11` — and an exact id match must beat forty tickets
 * whose prose happens to contain the same substring. Prefix matches come next, then plain
 * containment, and ties break towards the shorter title: `export-print` should outrank
 * `export-print-column-widths` when you typed the former.
 */
@Injectable()
export class SearchQuery implements Query<SearchInput, SearchHit[]> {
  constructor(private readonly assembler: FeatureSnapshotAssembler) {}

  async execute(input: SearchInput): Promise<SearchHit[]> {
    const term = input.term.trim().toLowerCase();
    if (term.length < 2) return [];

    const snapshots = await this.assembler.assembleAll();
    const hits: SearchHit[] = [];
    const seenRepositories = new Set<string>();

    for (const snapshot of snapshots) {
      const { repository, gateState, plan, construction } = snapshot;
      const slug = gateState.ref.slug.value;
      const featurePath = `/features/${repository.id.value}/${slug}`;
      const base = {
        repositoryId: repository.id.value,
        repositoryLabel: repository.label,
        featureSlug: slug,
      };

      if (!seenRepositories.has(repository.id.value)) {
        seenRepositories.add(repository.id.value);
        const score = this.score(term, repository.label, repository.absolutePath);
        if (score > 0) {
          hits.push({
            ...base,
            kind: 'repository',
            featureSlug: null,
            path: '/repositories',
            title: repository.label,
            subtitle: repository.absolutePath,
            badge: null,
            status: null,
            score: score * KIND_WEIGHT.repository,
          });
        }
      }

      const featureScore = this.score(term, slug, plan.intent.problem ?? '');
      if (featureScore > 0) {
        hits.push({
          ...base,
          kind: 'feature',
          path: featurePath,
          title: slug,
          subtitle: `${repository.label} · ${construction.tickets.length} tickets · ${gateState.currentGate.value}`,
          badge: gateState.managed ? gateState.currentGate.value : 'unmanaged',
          status: gateState.currentGate.value,
          score: featureScore * KIND_WEIGHT.feature,
        });
      }

      for (const uow of construction.unitsOfWork) {
        const score = this.score(term, uow.id.value, uow.title);
        if (score > 0) {
          hits.push({
            ...base,
            kind: 'unit-of-work',
            path: `${featurePath}?uow=${uow.id.value}`,
            title: uow.title || uow.id.value,
            subtitle: `${repository.label} · ${slug}`,
            badge: uow.id.value,
            status: uow.status.value,
            score: score * KIND_WEIGHT['unit-of-work'],
          });
        }
      }

      for (const ticket of construction.tickets) {
        const score = this.score(term, ticket.id.value, ticket.title);
        if (score > 0) {
          hits.push({
            ...base,
            kind: 'ticket',
            path: `${featurePath}?ticket=${ticket.id.value}`,
            title: ticket.title || ticket.id.value,
            subtitle: `${repository.label} · ${slug} · ${ticket.layer.name}`,
            badge: ticket.id.value,
            status: ticket.status.value,
            score: score * KIND_WEIGHT.ticket,
          });
        }
      }

      for (const criterion of plan.acceptanceCriteria) {
        const score = this.score(term, criterion.id, criterion.title);
        if (score > 0) {
          hits.push({
            ...base,
            kind: 'criterion',
            path: `${featurePath}?tab=traceability`,
            title: criterion.title || criterion.id,
            subtitle: `${repository.label} · ${slug}`,
            badge: criterion.id,
            status: null,
            score: score * KIND_WEIGHT.criterion,
          });
        }
      }

      for (const assumption of plan.assumptions) {
        const score = this.score(term, assumption.id, assumption.text);
        if (score > 0) {
          hits.push({
            ...base,
            kind: 'assumption',
            path: `${featurePath}?tab=assumptions`,
            title: assumption.text.slice(0, 120) || assumption.id,
            subtitle: `${repository.label} · ${slug}`,
            badge: assumption.id,
            status: assumption.status.value,
            score: score * KIND_WEIGHT.assumption,
          });
        }
      }
    }

    return hits.sort((a, b) => b.score - a.score || a.title.length - b.title.length).slice(0, input.limit ?? 40);
  }

  /** `identifier` is the thing you would type from memory; `body` is prose. */
  private score(term: string, identifier: string, body: string): number {
    const id = identifier.toLowerCase();
    if (id === term) return 100;
    if (id.startsWith(term)) return 60;
    if (id.includes(term)) return 30;
    return body.toLowerCase().includes(term) ? 10 : 0;
  }
}
