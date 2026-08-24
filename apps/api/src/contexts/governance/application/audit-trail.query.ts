import { Injectable } from '@nestjs/common';

import { Query } from '../../../shared/application/use-case';
import { FeatureSnapshotAssembler } from '../../insight/application/feature-snapshot.assembler';

export interface AuditRow {
  repositoryId: string;
  repositoryLabel: string;
  featureSlug: string;
  gate: string;
  action: string;
  at: string | null;
  by: string;
  ticket: string | null;
  reason: string | null;
  evidence: string | null;
  reviewBypass: boolean;
}

export interface AuditTrailInput {
  repositoryId?: string;
  slug?: string;
  limit?: number;
}

/**
 * The approval trail, portfolio-wide.
 *
 * Multica calls its equivalent the execution log — replay every tool call, timestamped.
 * The AI-DLC analogue is narrower and more valuable: not every action, but every action a
 * *person* took responsibility for. It is also the only place a review bypass is visible,
 * which is exactly why `aidlc done --no-review` records one rather than staying quiet.
 */
@Injectable()
export class AuditTrailQuery implements Query<AuditTrailInput, AuditRow[]> {
  constructor(private readonly assembler: FeatureSnapshotAssembler) {}

  async execute(input: AuditTrailInput = {}): Promise<AuditRow[]> {
    const snapshots = await this.assembler.assembleAll();
    const rows: AuditRow[] = [];

    for (const snapshot of snapshots) {
      if (input.repositoryId && snapshot.repository.id.value !== input.repositoryId) continue;
      const slug = snapshot.gateState.ref.slug.value;
      if (input.slug && slug !== input.slug) continue;

      for (const entry of snapshot.gateState.history) {
        rows.push({
          repositoryId: snapshot.repository.id.value,
          repositoryLabel: snapshot.repository.label,
          featureSlug: slug,
          gate: entry.gate.value,
          action: entry.action,
          at: entry.at?.toISOString() ?? null,
          by: entry.by,
          ticket: entry.ticket,
          reason: entry.reason,
          evidence: entry.evidence,
          reviewBypass: entry.isReviewBypass,
        });
      }
    }

    rows.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
    return input.limit ? rows.slice(0, input.limit) : rows;
  }
}
