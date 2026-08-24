import { describe, expect, it } from 'vitest';

import { asList, asScalar, parseFrontmatter, parseYamlishBlock } from '../src/shared/infrastructure/text/frontmatter.parser';

/**
 * These assert agreement with `parse_frontmatter` in uow_graph.py, not with YAML.
 * Where the two could differ, the Python wins — it is the parser the gate checks use.
 */
describe('frontmatter parser', () => {
  it('reads scalars, inline lists and block lists', () => {
    const { data, error } = parseFrontmatter(
      ['---', 'id: T-01-02', 'depends_on: [T-01-01, T-01-03]', 'touches:', '  - src/a.ts', '  - src/b.ts', '---', '', '# body'].join('\n'),
    );
    expect(error).toBeNull();
    expect(asScalar(data['id'])).toBe('T-01-02');
    expect(asList(data['depends_on'])).toEqual(['T-01-01', 'T-01-03']);
    expect(asList(data['touches'])).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('keeps trailing comments on list items but strips them from scalars', () => {
    // The `# new` marker on a touches path declares a file that does not exist yet.
    // Stripping it would make `lint-touches` reject every correctly-annotated new path —
    // a bug the AI-DLC pilot run actually hit.
    const { data } = parseFrontmatter(
      ['---', 'title: A thing  # not part of the title', 'touches:', '  - src/new.ts  # new', '---'].join('\n'),
    );
    expect(asScalar(data['title'])).toBe('A thing');
    expect(asList(data['touches'])).toEqual(['src/new.ts  # new']);
  });

  it('reports a missing or unterminated block instead of guessing', () => {
    expect(parseFrontmatter('# no frontmatter').error).toMatch(/missing YAML frontmatter/);
    expect(parseFrontmatter('---\nid: X\n').error).toMatch(/unterminated/);
  });

  it('treats an empty value as the start of a block list', () => {
    const data = parseYamlishBlock(['layers:', '  - domain', '  - api'].join('\n'));
    expect(asList(data['layers'])).toEqual(['domain', 'api']);
  });

  it('reads the aidlc.yaml dialect without fences', () => {
    const data = parseYamlishBlock(['profile: none', 'ruleset: 4', 'layers: [config, data, ui]'].join('\n'));
    expect(asScalar(data['profile'])).toBe('none');
    expect(asScalar(data['ruleset'])).toBe('4');
    expect(asList(data['layers'])).toEqual(['config', 'data', 'ui']);
  });
});
