export type FrontmatterValue = string | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export interface FrontmatterResult {
  data: Frontmatter;
  /** Null when the block parsed. A non-null error is itself a finding worth showing. */
  error: string | null;
  /** Everything after the closing `---`, so callers do not re-read the file. */
  body: string;
}

/**
 * A deliberate line-by-line port of `parse_frontmatter` in
 * `ai-dlc-core/scripts/uow_graph.py` — not a real YAML parser.
 *
 * The console must see exactly what the controller sees. A permissive YAML library would
 * happily read a file the controller rejects (or read it differently), and the console
 * would then report a plan as healthy that `aidlc check G3` refuses. Where the two must
 * agree, the cheap parser wins.
 *
 * The subtle rule, and the one a rewrite gets wrong: trailing comments are stripped from
 * scalars but NOT from list items, because `touches:` uses `- path/to/file.ts  # new` to
 * declare a file that does not exist yet.
 */
export function parseFrontmatter(text: string): FrontmatterResult {
  if (!text.startsWith('---')) {
    return { data: {}, error: 'missing YAML frontmatter (file must start with ---)', body: text };
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) {
    return { data: {}, error: 'unterminated frontmatter block', body: '' };
  }

  const block = text.slice(3, end);
  const body = text.slice(end + 4);
  return { data: parseYamlishBlock(block), error: null, body };
}

/**
 * The same dialect without the `---` fences, for `.ai/aidlc.yaml` — which is a plain
 * config file, not frontmatter, but is written in exactly the subset above.
 */
export function parseYamlishBlock(block: string): Frontmatter {
  const data: Frontmatter = {};
  let currentListKey: string | null = null;

  for (const raw of block.split('\n')) {
    const strippedComment = raw.split('  #')[0].replace(/\s+$/, '');
    const isListItem = /^[ \t]/.test(raw) && raw.trim().startsWith('- ');
    const line = isListItem ? raw.replace(/\s+$/, '') : strippedComment;

    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (isListItem) {
      if (currentListKey) {
        (data[currentListKey] as string[]).push(unquote(line.trim().slice(2).trim()));
      }
      continue;
    }

    const colon = line.indexOf(':');
    if (colon === -1) continue;

    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();

    if (value === '') {
      currentListKey = key;
      data[key] = [];
      continue;
    }

    currentListKey = null;
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      data[key] = inner
        .split(',')
        .map((v) => unquote(v.trim()))
        .filter((v) => v.length > 0);
    } else {
      data[key] = unquote(value);
    }
  }

  return data;
}

function unquote(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '');
}

/** Mirrors `as_list` in uow_graph.py: a missing key is an empty list, never null. */
export function asList(value: FrontmatterValue | undefined): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

/** Reads a scalar, tolerating a key that was written as a single-item list. */
export function asScalar(value: FrontmatterValue | undefined): string {
  if (value === undefined || value === null) return '';
  return Array.isArray(value) ? (value[0] ?? '') : value;
}
