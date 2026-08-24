import { Injectable } from '@nestjs/common';
import * as path from 'node:path';

import { FeatureRef, Gate } from '../../../shared/kernel';
import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import { AuditEntry } from '../domain/model/audit-entry';
import { GateState } from '../domain/model/gate-state';
import { GateStateReaderPort } from '../domain/ports/gate-state-reader.port';

const STATE_FILE = '.aidlc-state.yaml';

@Injectable()
export class FilesystemGateStateReader implements GateStateReaderPort {
  constructor(private readonly fs: FileSystem) {}

  async read(ref: FeatureRef, featureDirectory: string): Promise<GateState> {
    const text = await this.fs.readText(path.join(featureDirectory, STATE_FILE));
    if (text === null) return GateState.unmanaged(ref);

    const { scalars, history } = this.parseState(text);
    return GateState.create({
      ref,
      currentGate: Gate.tryCreate(scalars['current_gate'] ?? ''),
      profile: scalars['profile'] ?? 'none',
      createdAt: this.parseDate(scalars['created']),
      history,
    });
  }

  /**
   * Reads the state file's own dialect: top-level scalars plus a `history:` list of
   * blocks. `save_state` in aidlc.py writes it and replaces `:` inside free text with
   * ` -` precisely so a naive line parser like this one stays correct — which is why
   * splitting on the *first* colon is safe here.
   */
  private parseState(text: string): { scalars: Record<string, string>; history: AuditEntry[] } {
    const scalars: Record<string, string> = {};
    const history: AuditEntry[] = [];
    let current: Record<string, string> | null = null;
    let inHistory = false;

    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s+$/, '');
      if (!line.trim() || line.trim().startsWith('#')) continue;

      if (!/^\s/.test(line)) {
        if (current) {
          history.push(this.toEntry(current));
          current = null;
        }
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();
        inHistory = key === 'history';
        if (!inHistory) scalars[key] = value;
        continue;
      }

      if (!inHistory) continue;

      const item = /^\s*-\s+(.*)$/.exec(line);
      if (item) {
        if (current) history.push(this.toEntry(current));
        current = {};
        this.assign(current, item[1]);
        continue;
      }
      if (current) this.assign(current, line.trim());
    }

    if (current) history.push(this.toEntry(current));
    return { scalars, history };
  }

  private assign(target: Record<string, string>, fragment: string): void {
    const colon = fragment.indexOf(':');
    if (colon === -1) return;
    // Trailing `  # note` is a comment the controller writes alongside evidence.
    target[fragment.slice(0, colon).trim()] = fragment.slice(colon + 1).split('  #')[0].trim();
  }

  private toEntry(raw: Record<string, string>): AuditEntry {
    return AuditEntry.create({
      gate: Gate.tryCreate(raw['gate'] ?? ''),
      action: raw['action'] ?? '?',
      at: this.parseDate(raw['at']),
      by: raw['by'] ?? '?',
      ticket: raw['ticket'] || null,
      reason: raw['reason'] || null,
      evidence: raw['evidence'] || null,
    });
  }

  private parseDate(value: string | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
