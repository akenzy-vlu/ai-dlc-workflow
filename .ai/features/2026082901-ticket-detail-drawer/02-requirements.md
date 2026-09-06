# Requirements — ticket-detail-drawer

## US-01 — Read a ticket without leaving the console

As a reviewer looking at the units-of-work panel, I want to open a ticket's full content
from its row, so that I can judge it without finding the file by hand.

**AC-01** — a row click opens the drawer
```gherkin
Given the units-of-work panel showing a ticket row
When I click anywhere on that row
Then a drawer opens showing that ticket's full title, status, layer, type and estimate
```

**AC-02** — the free-text sections render
```gherkin
Given a ticket whose file has `## Context` and `## Implementation notes` sections
When its drawer is open
Then both sections render as written, in full — no truncation
```

**AC-03** — a ticket with no such sections still opens cleanly
```gherkin
Given a ticket whose file predates this feature, or uses different heading text
When its drawer is open
Then the drawer still shows every other field
And the two prose fields are simply absent, not an error state
```

**AC-04** — the structured lists are all present
```gherkin
Given a ticket with touches, verifies, dependsOn, blocks and assumptions entries
When its drawer is open
Then every one of those lists is shown in full, not just the counts the row already gives
```

**AC-05** — the done-when checklist is the real one, not a tooltip
```gherkin
Given a ticket whose done-when items are only visible today as a tooltip on the row
When its drawer is open
Then every item is shown as its own line, ticked or not
```

## US-02 — Act on what was just read

As a reviewer, I want to accept or reject the ticket from the same drawer I read it in, so
that reading and deciding are not two separate places.

**AC-06** — the existing action control is available
```gherkin
Given a ticket in review, open in the drawer
When I look at the drawer
Then the same Accept/Reject control the row already offers is present and works
```

**AC-07** — opening the drawer changes nothing
```gherkin
Given any ticket, in any status
When its drawer is opened and then closed without using Accept/Reject
Then the ticket's status and the plan on disk are unchanged
```
