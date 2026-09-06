# Intent — ticket-detail-drawer

## Problem

The units-of-work panel's ticket table truncates the title (`ellipsis: true`) and shows
nothing else a reviewer would need to actually judge a ticket — no Context, no
Implementation notes, no full `touches`/`verifies`/`assumptions` lists. Clicking a row does
nothing. A reviewer facing `Accept`/`Reject` on a ticket in `review` has no way to read what
the ticket actually asked for without leaving the console and opening the file by hand.

This was flagged directly against a real project's board: several tickets sit `in review`
with 12/12 or 9/9 done-when items ticked, and the only text visible in the console is the
truncated title.

## Success signal

Clicking anywhere on a ticket row opens a drawer showing the ticket whole: title
untruncated, status, layer/type/estimate, Context, Implementation notes, the full
done-when checklist, `touches`/`verifies`/`dependsOn`/`blocks`/`assumptions`, and — for a
ticket in `review` — the same Accept/Reject control the row already has, so reading and
deciding happen in one place.

## Out of scope

- Editing a ticket's content from the drawer. It stays read-only; the file on disk is
  still the thing a human edits.
- A detail view for UoWs — the units-of-work panel already expands inline with Demo
  script and Definition of done. This is about the ticket level only.
- Any change to what `check_g3`/`check_g4` validate. This is a read surface.

## Constraints

- **The console never writes plan state.** The drawer is read-only by construction; the
  only mutation available from it is the existing `TicketActions` component, reused
  as-is rather than reimplemented.
- **`Context` and `Implementation notes` are free text, not frontmatter.** They have to be
  extracted from the ticket's markdown body the way `sectionBody()` already extracts
  `Demo script` for a UoW and `Problem`/`Success signal` for intent — the reader has the
  tool, it was just never pointed at a ticket file's body.
- **Ticket templates are a contract** (`templates.md`, `REQUIRED_*` in `aidlc.py`). This
  feature reads two more section headings out of an existing template shape; it does not
  add a new required section, and a ticket predating this feature (no Context/
  Implementation notes heading, or headings worded differently) must render with those
  fields empty, not throw.
