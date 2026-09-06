import { describe, expect, it } from 'vitest';

import { sectionBody } from '../src/shared/infrastructure/text/markdown.reader';

/**
 * `sectionBody()` already reads a UoW's `Demo script` and an intent doc's `Problem` /
 * `Success signal`. This pins the same function against a ticket file's shape — in
 * particular the hardest real case in this repo: `Implementation notes` followed by an
 * unplanned `## Amendment` section (bullets, inline code) before `## Done when`, taken
 * verbatim from `T-02-06.md` and confirmed against A-02 during elaboration.
 */
const TICKET_WITH_AMENDMENT = `# T-02-06 — AgentLauncherService.reply()

## Context
A second entry point beside \`launch\`, sharing its conflict rules and its hand-off,
differing in what goes in the prompt and what goes in argv.

The one thing it must *not* share is the controller call. \`launch\` moves a \`todo\` ticket to
\`in_progress\`; \`reply\` requests no transition at all (ADR-05).

## Implementation notes
- Resolve the parent run; refuse if \`telemetry.sessionId\` is null
- Do **not** call \`this.tickets.transition\` anywhere in this method

## Amendment during construction
Drafted with no test file in \`touches\` — the plan gave the exhaustive refusal matrix and
the gate proof to T-02-08.

## Done when
- [x] A reply to a resumable run starts a run with the parent's session id
- [x] The child's prompt is the reply text with no brief appended
`;

const TICKET_WITH_NEITHER = `# T-99-99 — A ticket predating this feature

## Notes
Some free text under a heading this feature does not look for.

## Done when
- [ ] Something
`;

describe('sectionBody() against a ticket file', () => {
  it('extracts Context, stopping cleanly at Implementation notes', () => {
    const body = sectionBody(TICKET_WITH_AMENDMENT, 'Context');

    expect(body).toContain('A second entry point beside `launch`');
    expect(body).toContain('ADR-05');
    expect(body).not.toContain('Implementation notes');
    expect(body).not.toContain('Resolve the parent run');
  });

  it('extracts Implementation notes, stopping at the unplanned Amendment section rather than running past it into Done when', () => {
    const body = sectionBody(TICKET_WITH_AMENDMENT, 'Implementation notes');

    expect(body).toContain('Resolve the parent run');
    expect(body).toContain('Do **not** call `this.tickets.transition`');
    expect(body).not.toContain('Amendment during construction');
    expect(body).not.toContain('Done when');
    expect(body).not.toContain('[x]');
  });

  it('returns null, not an empty string, when a heading is absent', () => {
    expect(sectionBody(TICKET_WITH_NEITHER, 'Context')).toBeNull();
    expect(sectionBody(TICKET_WITH_NEITHER, 'Implementation notes')).toBeNull();
  });

  it('does not confuse a differently-worded heading with the one it is looking for', () => {
    // TICKET_WITH_NEITHER has a `## Notes` heading — close, but not `Implementation notes`.
    expect(sectionBody(TICKET_WITH_NEITHER, 'Implementation notes')).toBeNull();
  });
});
