import { Injectable } from '@nestjs/common';
import * as path from 'node:path';

import { FeatureRef } from '../../../shared/kernel';
import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import { parseFrontmatter } from '../../../shared/infrastructure/text/frontmatter.parser';
import {
  missingSections,
  normaliseCell,
  sectionBody,
  tableRows,
  todoCount,
} from '../../../shared/infrastructure/text/markdown.reader';
import { AcceptanceCriterion } from '../domain/model/acceptance-criterion';
import { ArchitectureDecision } from '../domain/model/architecture-decision';
import { Assumption, AssumptionStatus } from '../domain/model/assumption';
import { ArchitectureMap, DesignDocument, FeaturePlan, IntentDocument } from '../domain/model/feature-plan';
import { FeaturePlanReaderPort } from '../domain/ports/feature-plan.port';

/** Mirrors REQUIRED_INTENT_SECTIONS / REQUIRED_DESIGN_SECTIONS in aidlc.py. */
const REQUIRED_INTENT_SECTIONS = ['Problem', 'Success signal', 'Out of scope'] as const;
const REQUIRED_DESIGN_SECTIONS = ['Approach', 'Alternatives rejected', 'Error taxonomy', 'ADR'] as const;

@Injectable()
export class FilesystemFeaturePlanReader implements FeaturePlanReaderPort {
  constructor(private readonly fs: FileSystem) {}

  async read(ref: FeatureRef, featureDirectory: string, repoRoot: string): Promise<FeaturePlan> {
    const [intentText, assumptionsText, requirementsText, designText, architectureText, documents] =
      await Promise.all([
        this.fs.readText(path.join(featureDirectory, '00-intent.md')),
        this.fs.readText(path.join(featureDirectory, '01-assumptions.md')),
        this.fs.readText(path.join(featureDirectory, '02-requirements.md')),
        this.fs.readText(path.join(featureDirectory, '03-logical-design.md')),
        this.fs.readText(path.join(repoRoot, '.ai', 'architecture.md')),
        this.fs.listFiles(featureDirectory, '.md'),
      ]);

    return FeaturePlan.create({
      ref,
      directory: featureDirectory,
      intent: this.readIntent(intentText),
      assumptions: this.readAssumptions(assumptionsText),
      acceptanceCriteria: this.readAcceptanceCriteria(requirementsText),
      design: this.readDesign(designText),
      decisions: this.readDecisions(designText),
      architectureMap: this.readArchitectureMap(architectureText),
      documents,
    });
  }

  async readDocument(featureDirectory: string, filename: string): Promise<string | null> {
    // Path traversal guard: the viewer may only reach files inside the feature directory.
    const target = path.resolve(featureDirectory, filename);
    if (!target.startsWith(path.resolve(featureDirectory) + path.sep)) return null;
    return this.fs.readText(target);
  }

  private readIntent(text: string | null): IntentDocument {
    if (text === null) {
      return { present: false, missingSections: [...REQUIRED_INTENT_SECTIONS], todoCount: 0, problem: null, successSignal: null, outOfScope: null };
    }
    return {
      present: true,
      missingSections: missingSections(text, REQUIRED_INTENT_SECTIONS),
      todoCount: todoCount(text),
      problem: sectionBody(text, 'Problem'),
      successSignal: sectionBody(text, 'Success signal'),
      outOfScope: sectionBody(text, 'Out of scope'),
    };
  }

  private readDesign(text: string | null): DesignDocument {
    if (text === null) {
      return { present: false, missingSections: [...REQUIRED_DESIGN_SECTIONS], todoCount: 0, approach: null };
    }
    return {
      present: true,
      missingSections: missingSections(text, REQUIRED_DESIGN_SECTIONS),
      todoCount: todoCount(text),
      approach: sectionBody(text, 'Approach'),
    };
  }

  /**
   * Reads the assumption table. Mirrors `assumption_rows` in aidlc.py: a row counts only
   * when it has at least 7 cells and the first is an `A-nn` id.
   *
   * Real registers contain rows whose prose runs long enough to be mistaken for another
   * column, so anything short of 7 cells is skipped rather than guessed at — the same
   * choice the controller makes, which keeps the two counts equal.
   */
  private readAssumptions(text: string | null): Assumption[] {
    if (text === null) return [];
    const out: Assumption[] = [];
    for (const cells of tableRows(text)) {
      if (cells.length < 7) continue;
      const id = cells[0].trim();
      if (!/^a-\d+$/i.test(normaliseCell(id))) continue;
      out.push(
        Assumption.create({
          id: normaliseCell(id).toUpperCase(),
          text: cells[1],
          confidence: normaliseCell(cells[2]),
          blocking: ['yes', 'true'].includes(normaliseCell(cells[3])),
          blastRadius: cells[4],
          status: AssumptionStatus.parse(cells[5]),
          resolution: cells[6].replace(/^[\s—-]+|[\s—-]+$/g, ''),
        }),
      );
    }
    return out;
  }

  /** `**AC-nn** — title`, with the fenced Gherkin block that follows it, if any. */
  private readAcceptanceCriteria(text: string | null): AcceptanceCriterion[] {
    if (text === null) return [];
    const lines = text.split('\n');
    const out: AcceptanceCriterion[] = [];
    const seen = new Set<string>();
    let story: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const storyMatch = /^#{2,3}\s+(US-\d+.*)$/.exec(lines[i]);
      if (storyMatch) {
        story = storyMatch[1].trim();
        continue;
      }
      const acMatch = /^\**\s*(AC-\d+)\s*\**\s*[—:-]?\s*(.*)$/.exec(lines[i].trim());
      if (!acMatch) continue;
      const id = acMatch[1];
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(
        AcceptanceCriterion.create({
          id,
          title: acMatch[2].replace(/\*+$/, '').trim(),
          story,
          gherkin: this.gherkinAfter(lines, i),
        }),
      );
    }
    return out;
  }

  private gherkinAfter(lines: string[], from: number): string | null {
    for (let i = from + 1; i < Math.min(from + 8, lines.length); i++) {
      if (!lines[i].trim().startsWith('```')) continue;
      const body: string[] = [];
      for (let j = i + 1; j < lines.length && !lines[j].trim().startsWith('```'); j++) body.push(lines[j]);
      return body.join('\n').trim() || null;
    }
    return null;
  }

  /** `### ADR-nn — title` followed by `**Status:** accepted`. */
  private readDecisions(text: string | null): ArchitectureDecision[] {
    if (text === null) return [];
    const lines = text.split('\n');
    const out: ArchitectureDecision[] = [];

    for (let i = 0; i < lines.length; i++) {
      const m = /^#{3,4}\s+(ADR-\d+)\s*[—:-]?\s*(.*)$/.exec(lines[i].trim());
      if (!m) continue;
      const body: string[] = [];
      let status = '';
      for (let j = i + 1; j < lines.length && !/^#{3,4}\s+ADR-\d+/.test(lines[j].trim()); j++) {
        const s = /^\**Status:\**\s*(.+)$/i.exec(lines[j].trim());
        if (s && !status) status = s[1];
        body.push(lines[j]);
      }
      out.push(ArchitectureDecision.create({ id: m[1], title: m[2].trim(), status, body: body.join('\n').trim() }));
    }
    return out;
  }

  private readArchitectureMap(text: string | null): ArchitectureMap {
    if (text === null) return { present: false, verifiedBy: null };
    const { data } = parseFrontmatter(text);
    const raw = typeof data['verified_by'] === 'string' ? data['verified_by'] : '';
    const value = raw.trim();
    // A placeholder comment left by the discovery script is not a signature.
    return { present: true, verifiedBy: value && !value.startsWith('#') ? value : null };
  }
}
