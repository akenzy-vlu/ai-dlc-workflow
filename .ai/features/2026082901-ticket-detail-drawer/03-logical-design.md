# Logical design — ticket-detail-drawer

## Approach

Two additions, one on each side of the wire the units-of-work panel already uses.

**API.** `sectionBody()` — already used for a UoW's Demo script and for intent/design
sections — gets pointed at a ticket file's body too. `Ticket` (domain) gains `context:
string | null` and `implementationNotes: string | null`; `FilesystemConstructionPlanReader`
fills them the same way it already fills `demoScript` on `UnitOfWork`. No new endpoint:
tickets already travel inside `FeatureDetail`, which the units-of-work panel already
fetches — the two new fields ride along.

**Web.** A `TicketDetailDrawer` feature, same container/view/props shape as
`AgentRunDrawer` beside it. `UnitsOfWorkPanel` gains one piece of state — which ticket id
is open — and an `onRow` handler on the existing `Table`. The drawer's body is every field
`Ticket` already carries, laid out in full instead of truncated/tooltipped, plus the two
new prose fields, plus `TicketActions` (unmodified) for the accept/reject control AC-06
asks for.

## Alternatives rejected

| Option | Why not |
|---|---|
| A separate `GET .../tickets/:id` endpoint | The ticket is already inside `FeatureDetail`, which the panel already holds in memory. A second fetch for data already on the page is a network round trip for nothing |
| Parse Context/Implementation notes on the web side from a raw markdown fetch | The API already owns frontmatter/section parsing (`sectionBody`, `parseFrontmatter`) for every other artifact. Duplicating that logic in the client is the frontmatter-schema mistake this whole system's design note warns about, aimed at a different field |
| Make the whole row clickable to accept, and add a separate small "view" icon for the drawer | Two click targets that do different things on the same row invite a fat-fingered accept. One click reads; the existing explicit `Accept`/`Reject` buttons still require their own confirming click, unchanged |
| A modal instead of a drawer | `AgentRunDrawer` already established the drawer pattern for exactly this kind of "read this ticket's detail" surface next to the same table. A modal here would be a second interaction idiom for the same panel |

## Contracts

`Ticket` (both sides) gains, after `assumptions`:
```
context: string | null
implementationNotes: string | null
```
Nothing else in `Ticket`'s shape changes. No new HTTP route.

## Error taxonomy

| Condition | Where it is caught | What happens |
|---|---|---|
| Ticket file has no `## Context` / `## Implementation notes` heading | `sectionBody()`, already null-safe | Both fields `null`; the drawer omits that block entirely rather than showing an empty card |
| `sectionBody()` picks up a checklist or a later `##` heading as part of the section body | `sectionBody()`'s own boundary — stops at the next `##` | Unchanged behavior, verified against a real ticket in T-01-01 (A-02) |
| A ticket the panel does not have loaded (stale id in a closed tab, e.g.) | `UnitsOfWorkPanel` container | Drawer simply does not open — no id, no ticket, no crash |
| Drawer open, ticket accepted from inside it | `TicketActions`, unchanged | Existing invalidation refetches the feature; the drawer's ticket prop updates from the same data the row does, since both read the same `feature.tickets` |

## ADRs

### ADR-01 — Ride the data the panel already has; no new endpoint
**Status:** accepted
**Context:** The ticket detail could be fetched fresh per drawer-open, or ride along with
what `UnitsOfWorkPanel` already receives.
**Decision:** Extend `Ticket`, not add a route. `FeatureDetail` already carries every
ticket; two more string fields cost nothing the panel does not already pay for.
**Consequences:** The drawer can never show something the feature snapshot does not
already have — which is fine, since nothing it needs lives anywhere else. If a future
ticket surface needs something genuinely not in the snapshot, that is a different design
question, not a precedent this ADR overrides.
