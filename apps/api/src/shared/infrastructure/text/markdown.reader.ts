export interface ChecklistState {
  ticked: number;
  unticked: number;
  items: { text: string; done: boolean }[];
}

/** `## Heading` / `### Heading` titles, in document order. */
export function headings(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^#{2,6}\s+(.*)$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/**
 * Which of `required` are absent. Mirrors `has_sections` in aidlc.py: a section counts
 * as present when a heading *starts with* the required name, so `## Problem statement`
 * satisfies `Problem`.
 */
export function missingSections(text: string, required: readonly string[]): string[] {
  const found = headings(text).map((h) => h.toLowerCase());
  return required.filter((r) => !found.some((h) => h.startsWith(r.toLowerCase())));
}

/** The body under a heading, up to the next heading of the same or higher level. */
export function sectionBody(text: string, heading: string): string | null {
  const lines = text.split('\n');
  const target = heading.toLowerCase();
  let level = 0;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{2,6})\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (start === -1 && m[2].trim().toLowerCase().startsWith(target)) {
      level = m[1].length;
      start = i + 1;
      continue;
    }
    if (start !== -1 && m[1].length <= level) {
      return lines.slice(start, i).join('\n').trim();
    }
  }
  return start === -1 ? null : lines.slice(start).join('\n').trim();
}

/**
 * `- [ ]` / `- [x]` counts. This is the mechanism G3 and G4 hang on: a UoW with an
 * unticked definition-of-done item cannot pass G4, and ai-dlc-verify writes its evidence
 * as exactly these boxes.
 */
export function checklistState(text: string): ChecklistState {
  const items: { text: string; done: boolean }[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/.exec(line);
    if (!m) continue;
    items.push({ text: m[2].trim(), done: m[1].toLowerCase() === 'x' });
  }
  return {
    ticked: items.filter((i) => i.done).length,
    unticked: items.filter((i) => !i.done).length,
    items,
  };
}

/** How many `TODO` placeholders the scaffold left behind. A G0/G1/G2 blocker. */
export function todoCount(text: string): number {
  return (text.match(/\bTODO\b/g) ?? []).length;
}

/** Every `AC-nn` mentioned, de-duplicated, in first-appearance order. */
export function acceptanceCriteriaIds(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(/\bAC-\d+\b/g)) seen.add(m[0]);
  return [...seen];
}

/** Rows of a GitHub-flavoured pipe table, header and separator dropped. */
export function tableRows(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

/**
 * Markdown emphasis and backticks stripped, lowercased.
 *
 * Needed because the assumption register is hand-written and real files contain
 * `**resolved**` as often as `resolved`. Comparing the raw cell would classify the same
 * state two different ways.
 */
export function normaliseCell(value: string): string {
  return value
    .replace(/[*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
