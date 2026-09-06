---
id: UOW-01
slug: read-the-ticket
title: Click a ticket row, read the whole ticket, act on it
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07]
risk: low
status: todo
rollback: revert the onRow handler and drop the drawer import; Ticket keeps its two new nullable fields, which nothing else reads
---

# UOW-01 — Click a ticket row, read the whole ticket, act on it

The whole feature in one slice: the row becomes clickable, the drawer shows everything the
row today only hints at (a truncated title, a tooltip, a count), and the same Accept/Reject
control already on the row is available from inside it.

## Demo script
1. Open a feature at G3 or later with at least one ticket in `review`
2. Click anywhere on that ticket's row — not just an icon
3. A drawer opens: full title, status, layer, type, estimate
4. Its `Context` and `Implementation notes` render as written, not truncated
5. `touches`, `verifies`, `dependsOn`, `blocks`, `assumptions` are each listed in full
6. Every done-when item is its own line, ticked or not — not a tooltip
7. Accept it from inside the drawer; the row updates the same way it would if accepted
   from the row itself
8. Open a ticket written before this feature (or with differently-worded headings) —
   the drawer opens clean, with the two prose fields simply absent

## In scope
- `Ticket.context` / `Ticket.implementationNotes`, both API and web
- The `TicketDetailDrawer` feature and wiring it into `UnitsOfWorkPanel`

## Not in scope
- Editing anything from the drawer
- A UoW-level detail drawer

## Risks
| Risk | Mitigation |
|---|---|
| A ticket predating this feature has no Context/Implementation notes heading | `sectionBody()` already returns null cleanly (A-01/A-02); the drawer omits the block rather than showing empty |
| Row click and the existing Agent/Actions column clicks fighting for the same click | `onRow`'s handler and the column buttons' `onClick` both call `stopPropagation` implicitly via React's event model only if handled — verified in T-01-03 that clicking Accept/Reject/the agent icon does not also open the drawer |

## Definition of done
- [x] AC-01 through AC-07 pass
- [x] A ticket with no Context/Implementation notes opens without error
- [x] Clicking a row's existing buttons (Agent, Accept, Reject) does not also open the drawer
- [x] Demoed and accepted at gate G4
