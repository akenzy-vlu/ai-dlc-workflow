---
id: UOW-02
slug: formatted-preview
title: Skill files render formatted — markdown preview and syntax highlighting
demoable: true
duration: 0.5d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-04, AC-05]
risk: low
status: todo
rollback: revert the content-viewer component to UOW-01's raw-text rendering; the two new
  dependencies (`react-markdown`, `highlight.js`) are additive and unused elsewhere
---

# UOW-02 — Skill files render formatted

## Demo script

1. Open the Skills page, open the `ai-dlc-core` drawer (from UOW-01).
2. `SKILL.md` is selected by default and renders as formatted markdown — headings, bold,
   code fences — not raw `#`/`**` markup.
3. Click "Plain text" — the same file switches to its raw markdown source.
4. Click `scripts/aidlc.py` in the tree — its content renders with Python syntax
   highlighting (keywords, strings, comments distinguished by color), with no
   Preview/Plain-text toggle shown for it.
5. Click a `references/*.md` file — same rendered-by-default + Plain-text-toggle
   behaviour as `SKILL.md`.

## In scope

- `react-markdown` rendering for `.md` files, with the Preview/Plain-text toggle.
- `highlight.js` syntax highlighting for non-markdown text files opened in UOW-01's
  content panel, with a plain-text fallback for extensions with no registered language.

## Not in scope

- Any change to the two API routes or the file tree — this UoW only changes how already-
  fetched content is displayed.

## Risks

| Risk | Mitigation |
| --- | --- |
| Two content-display concerns (markdown, highlighting) landing in the same component risks a write-conflict if split into two tickets | Kept as one ticket (T-02-01) touching one file, since both changes are inseparable parts of the same render branch |

## Definition of done

- [x] AC-04 and AC-05 pass — confirmed live in a real browser at T-02-01's review (see that
      ticket's verification note): markdown-by-default rendering, the Plain-text toggle both
      ways and its reset-on-file-change, and Python syntax highlighting with no toggle shown.
- [x] The Demo script above runs clean against a local `pnpm dev` — steps 1–5 run live
      (against `ai-dlc-verify`'s package rather than `ai-dlc-core`'s, same code path). A real
      bug surfaced by this exact run — unstripped YAML frontmatter garbling the top of every
      markdown preview — was found and fixed; see T-02-01's verification note.
- [x] An extension with no registered highlight.js language still renders as plain text,
      not an error (A-08) — confirmed live with `requirements.txt`.
- [x] Demoed and accepted at gate G4 — demoed live in a real browser during T-02-01's
      review (see its verification note); accepted by Akenzy.
