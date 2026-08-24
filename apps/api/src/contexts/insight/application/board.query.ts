import { Injectable } from '@nestjs/common';

import { Query } from '../../../shared/application/use-case';
import { RepositoryMaintenance } from '../../portfolio/application/repository-maintenance.use-case';
import { Facet, ViewFilter, applyFilters, buildFacet } from '../domain/view-filter';
import { FeatureSnapshotAssembler } from './feature-snapshot.assembler';

/** One checkout's view of a ticket that exists in several checkouts of a project. */
export interface CardCheckout {
  repositoryId: string;
  repositoryLabel: string;
  branch: string | null;
  status: string;
}

export interface BoardCard {
  ticketId: string;
  title: string;
  status: string;
  layer: string;
  layerDeclared: boolean;
  type: string;
  estimateHours: number;
  estimateLabel: string;
  uowId: string | null;
  uowTitle: string | null;
  risk: string;
  ready: boolean;
  onCriticalPath: boolean;
  unmetDependencies: number;
  untickedCount: number;
  verifies: string[];
  projectKey: string;
  projectLabel: string;
  repositoryId: string;
  repositoryLabel: string;
  /** The branch this checkout is on. Two clones of one project differ only by this. */
  branch: string | null;
  featureSlug: string;
  gate: string;
  lastActivityAt: string | null;
  /**
   * Every checkout this ticket was found in. One entry in the ordinary case; more when a
   * project has several clones or worktrees of the same plan.
   */
  checkouts: CardCheckout[];
  /** True when those checkouts disagree about the ticket's status. */
  diverged: boolean;
}

export interface BoardInput {
  /** `all`, `project:<key>`, `repository:<id>`, or `feature:<repoId>/<slug>`. */
  scope?: string;
  filters?: ViewFilter[];
  /** Include tickets from features below G3. Off by default: construction is locked. */
  includeLocked?: boolean;
  /**
   * Collapse the same ticket seen in several checkouts of one project into one card.
   *
   * On by default, and the default matters: two clones of one repository hold the same
   * plan files, so without this every ticket appears once per checkout and a project's
   * board shows twice the work that exists. Turn it off to compare branches directly.
   */
  mergeCheckouts?: boolean;
}

export interface BoardResult {
  cards: BoardCard[];
  facets: Facet[];
  /** Rows before filters, so the UI can say "42 of 310". */
  totalBeforeFilters: number;
  scopeLabel: string;
}

const FILTERABLE = [
  'project',
  'repository',
  'branch',
  'feature',
  'status',
  'layer',
  'type',
  'risk',
  'gate',
  'uow',
] as const;

/**
 * Every ticket in scope, as cards, with the facets needed to filter them.
 *
 * Cross-repository by design. A project whose checkouts are two clones on two branches
 * has one board, not two — grouping them apart doubles every count and makes the
 * portfolio look twice as busy as it is.
 *
 * Filtering happens here rather than in the browser because the unfiltered portfolio is
 * two thousand tickets, and shipping all of them to compute a facet count is a waste of
 * the one thing the console is supposed to be good at: answering fast.
 */
@Injectable()
export class BoardQuery implements Query<BoardInput, BoardResult> {
  constructor(
    private readonly assembler: FeatureSnapshotAssembler,
    private readonly repositories: RepositoryMaintenance,
  ) {}

  async execute(input: BoardInput = {}): Promise<BoardResult> {
    const [snapshots, projectIndex] = await Promise.all([
      this.assembler.assembleAll(),
      this.repositories.projectIndex(),
    ]);

    const scope = this.parseScope(input.scope);
    const cards: BoardCard[] = [];

    for (const snapshot of snapshots) {
      const { repository, gateState, construction } = snapshot;
      const project = projectIndex.get(repository.id.value);
      const slug = gateState.ref.slug.value;

      if (!input.includeLocked && !gateState.isConstructionUnlocked) continue;
      if (!this.inScope(scope, project?.key ?? '', repository.id.value, slug)) continue;

      const criticalPath = new Set(construction.graph.criticalPath().ticketIds);
      const readyIds = new Set(construction.graph.readyTickets().map((t) => t.id.value));

      for (const ticket of construction.tickets) {
        const uow = construction.unitsOfWork.find((u) => ticket.uow && u.id.equals(ticket.uow));
        cards.push({
          ticketId: ticket.id.value,
          title: ticket.title,
          status: ticket.status.value,
          layer: ticket.layer.name,
          layerDeclared: ticket.layer.isDeclared,
          type: ticket.type.value,
          estimateHours: ticket.estimate.hours,
          estimateLabel: ticket.estimate.toString(),
          uowId: ticket.uow?.value ?? null,
          uowTitle: uow?.title ?? null,
          risk: uow?.risk.value ?? 'unknown',
          ready: readyIds.has(ticket.id.value),
          onCriticalPath: criticalPath.has(ticket.id.value),
          unmetDependencies: construction.graph.unmetDependencyCount(ticket),
          untickedCount: ticket.untickedCount,
          verifies: [...ticket.verifies],
          projectKey: project?.key ?? `path:${repository.absolutePath}`,
          projectLabel: project?.label ?? repository.label,
          repositoryId: repository.id.value,
          repositoryLabel: repository.label,
          branch: repository.git?.branch ?? null,
          featureSlug: slug,
          gate: gateState.currentGate.value,
          lastActivityAt: gateState.lastActivityAt?.toISOString() ?? null,
          checkouts: [
            {
              repositoryId: repository.id.value,
              repositoryLabel: repository.label,
              branch: repository.git?.branch ?? null,
              status: ticket.status.value,
            },
          ],
          diverged: false,
        });
      }
    }

    const merged = input.mergeCheckouts === false ? cards : this.mergeAcrossCheckouts(cards);

    // Facets are computed on the *unfiltered* set so a value never vanishes from the
    // picker the moment you select it and nothing else matches.
    // Facet values are ids — a project key is `remote:github.com/owner/repo` — so each
    // property brings its own way of turning one back into something readable. Without
    // this the filter list offers raw keys, which is unusable for exactly the property
    // people filter by most.
    const labelResolvers: Record<string, (value: string) => string> = {
      project: (key) => [...projectIndex.values()].find((p) => p.key === key)?.label ?? key,
      repository: (id) => merged.find((c) => c.repositoryId === id)?.repositoryLabel ?? id,
    };

    const facets = FILTERABLE.map((property) =>
      buildFacet(
        merged,
        property,
        this.labelOf(property),
        (card) => this.read(card, property),
        labelResolvers[property],
      ),
    ).filter((facet) => facet.values.length > 1);

    const filtered = applyFilters(merged, input.filters ?? [], (card, property) =>
      this.read(card, property),
    );

    return {
      cards: filtered,
      facets,
      totalBeforeFilters: merged.length,
      scopeLabel: this.scopeLabel(scope, projectIndex),
    };
  }

  /**
   * Collapses one ticket seen in several checkouts of a project into a single card.
   *
   * Where the checkouts disagree about status, the card takes the *least* advanced one.
   * A ticket that is done on `main` and still todo on a feature branch is not finished —
   * placing it under Done would tell you there is no work left when there is, and the
   * board exists to answer exactly that question. The divergence is not hidden: the card
   * carries every checkout's status, and the UI marks it.
   */
  private mergeAcrossCheckouts(cards: BoardCard[]): BoardCard[] {
    const RANK: Record<string, number> = { blocked: 0, todo: 1, in_progress: 2, review: 3, done: 4 };
    const groups = new Map<string, BoardCard[]>();

    for (const card of cards) {
      const key = `${card.projectKey}::${card.featureSlug}::${card.ticketId}`;
      groups.set(key, [...(groups.get(key) ?? []), card]);
    }

    return [...groups.values()].map((group) => {
      if (group.length === 1) return group[0];

      const checkouts = group.flatMap((c) => c.checkouts);
      const statuses = new Set(checkouts.map((c) => c.status));
      const least = [...statuses].sort((a, b) => (RANK[a] ?? 1) - (RANK[b] ?? 1))[0];

      // Everything except status comes from whichever checkout carries that status, so
      // the estimate and dependency counts shown belong to the state being displayed.
      const source = group.find((c) => c.status === least) ?? group[0];
      return { ...source, status: least, checkouts, diverged: statuses.size > 1 };
    });
  }

  private read(card: BoardCard, property: string): string | string[] | null {
    switch (property) {
      case 'project':
        return card.projectKey;
      case 'repository':
        // A merged card belongs to every checkout it was found in, so filtering by one
        // checkout keeps it rather than dropping it for not being "the" repository.
        return card.checkouts.map((c) => c.repositoryId);
      case 'branch':
        return card.checkouts.map((c) => c.branch).filter((b): b is string => b !== null);
      case 'feature':
        return card.featureSlug;
      case 'status':
        return card.status;
      case 'layer':
        return card.layer;
      case 'type':
        return card.type;
      case 'risk':
        return card.risk;
      case 'gate':
        return card.gate;
      case 'uow':
        return card.uowId;
      case 'verifies':
        return card.verifies;
      default:
        return null;
    }
  }

  private labelOf(property: string): string {
    const labels: Record<string, string> = {
      project: 'Project',
      repository: 'Checkout',
      branch: 'Branch',
      feature: 'Feature',
      status: 'Status',
      layer: 'Layer',
      type: 'Type',
      risk: 'Risk',
      gate: 'Gate',
      uow: 'Unit of work',
    };
    return labels[property] ?? property;
  }

  private parseScope(scope?: string): { kind: string; value: string } {
    if (!scope || scope === 'all') return { kind: 'all', value: '' };
    const separator = scope.indexOf(':');
    if (separator === -1) return { kind: 'all', value: '' };
    return { kind: scope.slice(0, separator), value: scope.slice(separator + 1) };
  }

  private inScope(
    scope: { kind: string; value: string },
    projectKey: string,
    repositoryId: string,
    slug: string,
  ): boolean {
    switch (scope.kind) {
      case 'project':
        return projectKey === scope.value;
      case 'repository':
        return repositoryId === scope.value;
      case 'feature':
        return `${repositoryId}/${slug}` === scope.value;
      default:
        return true;
    }
  }

  private scopeLabel(
    scope: { kind: string; value: string },
    projects: Map<string, { key: string; label: string }>,
  ): string {
    if (scope.kind === 'project') {
      return [...projects.values()].find((p) => p.key === scope.value)?.label ?? scope.value;
    }
    if (scope.kind === 'repository') return scope.value;
    if (scope.kind === 'feature') return scope.value;
    return 'Everything';
  }
}
