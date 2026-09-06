---
id: UOW-01
slug: browse-and-read-skill-files
title: User can open a skill and read every file in its package as plain text
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-01, US-02, US-03]
verifies: [AC-01, AC-02, AC-03, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11]
risk: medium
status: todo
rollback: revert the two new API routes and the drawer wiring; the row click handler is
  additive, so removing it returns the Skills page to today's inert row
---

# UOW-01 — User can open a skill and read every file in its package as plain text

## Demo script

1. Open the Skills page.
2. Click the `ai-dlc-core` row (its name, not the Install/Sync button).
3. A drawer opens showing the file tree for `ai-dlc-core`'s source package: `SKILL.md`,
   `references/*.md`, `scripts/*.py` — no `__pycache__`, `.git`, or other noise paths.
4. `SKILL.md` is selected by default; its raw text content is visible.
5. Click `scripts/aidlc.py` in the tree; its raw text content loads in the same panel.
6. Click the Install/Sync button on a different skill's row in the background list (while
   the drawer is open, or after closing it) — it still installs/syncs normally; opening the
   drawer never interfered with it.
7. Close the drawer; the Skills page list underneath is unchanged.
8. (If a skill has more than one installation-target row, e.g. `ai-dlc-verify` across
   `erp2`/`erp3`/`jack-erp`) open the drawer from two different rows of the same skill —
   the same single file tree opens both times.
9. Stop the API, click a skill row — the drawer shows a fetch-error state with a retry
   action instead of a blank or stuck panel.

## In scope

- Two new read-only API routes: list a skill's files, read one file's raw content —
  reusing `listPackageFiles()`, guarded against path traversal.
- The Skills page row becomes clickable, opening a drawer with a file tree and a raw
  content panel.
- Oversized-file truncation and binary-file placeholder handling, end to end.

## Not in scope

- Rendering `.md` as formatted markdown, and syntax-highlighting non-markdown files —
  both files are shown as raw text here. That increment is UOW-02.
- Editing or saving any file (see Out of scope in `00-intent.md`).

## Risks

| Risk | Mitigation |
| --- | --- |
| Path-traversal guard has an edge case (symlink escape, encoded `..`) (A-06/A-07 adjacent) | `path.resolve` + strict prefix check mirrors `browse-directories.query.ts`'s already-reviewed idiom (ADR-02); T-01-01 tests the escape cases directly, not just the happy path |
| `apps/web` has no test runner (see `00-intent.md` Constraints) | Web tickets are verified by the Demo script above, not by an automated suite; the API-side guard (the part that would actually leak data if wrong) is unit-tested |

## Definition of done

- [x] AC-01, AC-02, AC-03, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11 all pass — AC-01/02/03/10
      confirmed live in a real browser at T-01-06's review (see that ticket's verification
      note); AC-06/07 rest on code review of `skill-file-content.tsx` plus
      `apps/api/test/skill-files.spec.ts` (no binary/oversized fixture exists among this
      repo's real skill packages to trigger those branches live without adding one); AC-09's
      row-click half was exercised live repeatedly, its button-independence half by code
      review only (a live click would have written to this machine's real `~/.claude/skills`
      or a tracked repo, an outward side effect deliberately avoided); AC-11 holds by
      construction (one `<tr>` per skill id) and was exercised live from two different
      skills' rows; AC-08 — see the item below.
- [x] The Demo script above runs clean against a local `pnpm dev` — steps 1–5, 7, 8, 9 run
      live; step 6 (Install/Sync independence) verified by code review instead of a live
      click, for the same reason noted above. A stray antd deprecation warning surfaced by
      this exact flow was fixed in `skill-file-content.tsx` (`message` → `title`) and
      re-verified.
- [x] A crafted `path` query value that escapes the skill's `sourcePath` is refused by the
      API before any filesystem read (AC-08), proven by a test, not just by manual demo —
      `apps/api/test/skill-files.spec.ts` and `skills.controller.spec.ts` both cover this
      directly (`../`, absolute-path, and symlink escapes).
- [x] Demoed and accepted at gate G4 — demoed live in a real browser during T-01-06 and
      T-02-01's review (see their verification notes); accepted by Akenzy.
