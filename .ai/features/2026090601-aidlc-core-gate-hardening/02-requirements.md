---
feature: aidlc-core-gate-hardening
stories: 5
acceptance_criteria: 17
---

# Requirements — AI-DLC core gate hardening

## US-01 — A ticket cannot be accepted by the actor that submitted it

As a reviewer, I want the controller to refuse an acceptance from the actor who submitted
the work, so that the separation `SKILL.md` promises is enforced rather than described.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Self-acceptance is refused
```gherkin
Given ticket T-01-01 is in review, submitted by "claude"
When "claude" runs accept on T-01-01
Then the command is refused with exit code 1
And the message names who submitted it and says a second actor must accept
And the ticket file's status line is unchanged
```

**AC-02** — A second actor accepts normally
```gherkin
Given ticket T-01-01 is in review, submitted by "claude"
When "akenzy" runs accept on T-01-01
Then the ticket moves to done
And the trail records the acceptance with actor "akenzy"
```

**AC-03** — The solo bypass still works and stays visible
```gherkin
Given ticket T-01-01 is in progress and its done-when boxes are ticked
When "claude" runs done on T-01-01 with the no-review flag
Then the ticket moves to done
And the trail records the action as a review bypass rather than a plain acceptance
```

**AC-04** — Actor names are compared insensitively to whitespace and case
```gherkin
Given ticket T-01-01 is in review, submitted by "Claude"
When "  claude " runs accept on T-01-01
Then the command is refused as a self-acceptance
```

## US-02 — A ticket cannot reach done without a passing recorded run

As a reviewer, I want "done" to mean a verification command actually ran and passed, so
that G4 checks a recorded fact rather than a character an agent typed in a markdown file.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-05** — A passing run is recorded on submit
```gherkin
Given the repo configures a verification command and ticket T-01-01 resolves to one
When the implementer runs submit on T-01-01
Then the command is executed and exits zero
And an evidence record is appended to the trail carrying the ticket id, the command, exit code 0, an output digest and a timestamp
And the ticket moves to review
```

**AC-06** — A failing run refuses the submit and is still recorded
```gherkin
Given the repo configures a verification command and that command exits non-zero for T-01-01
When the implementer runs submit on T-01-01
Then the submit is refused with exit code 1
And the failing run is appended to the trail with its non-zero exit code
And the ticket's status line is unchanged
```

**AC-07** — An unconfigured repo behaves exactly as it does today
```gherkin
Given the repo has no verification command configured
When the implementer runs submit on a ticket whose done-when boxes are ticked
Then the ticket moves to review with no evidence record and no refusal
And the output says verification is not configured for this repo
```

**AC-08** — G4 requires an evidence record per ticket under the new ruleset
```gherkin
Given a plan pinned to ruleset 5 in a repo that configures verification
And every ticket is done but one has no passing evidence record
When check G4 runs
Then G4 fails and names the ticket that has no passing run
```

**AC-09** — Recorded output is bounded and digested
```gherkin
Given a verification command that writes more than 64 KB to stdout, including a line containing a token-shaped string
When the run is recorded
Then the trail holds a digest of the full output and at most a bounded tail
And the recorded bytes never exceed the configured ceiling
```

**AC-10** — A run that cannot be started is a refusal, not a pass
```gherkin
Given the repo configures a verification command that does not exist on PATH
When the implementer runs submit on a ticket
Then the submit is refused and the trail records the failure to start
And the ticket does not move to review
```

## US-03 — Plans authored under the old rules keep working

As the owner of plans in erp2, erp3 and jack-erp, I want a tool upgrade never to invalidate
a plan authored before it, so that one global install cannot break every repo at once.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-11** — A ruleset-4 plan passes G4 without evidence
```gherkin
Given a plan whose recorded ruleset is 4 and which has no evidence records
And the repo configuration now pins ruleset 5
When check G4 runs on that plan
Then G4 evaluates it under ruleset-4 rules and can pass
And a migration hint names the ruleset it was authored under
```

**AC-12** — A plan created after the change is held to the new rule
```gherkin
Given the tool implements ruleset 5
When a new feature is initialised
Then its state file records ruleset 5
And check G4 on it requires evidence records
```

**AC-13** — The three plans already closed in this repo still validate
```gherkin
Given the three closed plans in this repo, all authored under ruleset 4
When the graph validator runs against each of them
Then each still validates, with warnings only
```

## US-04 — Waiting on something is a recorded state

As a reviewer, I want a ticket blocked on an external dependency to say so through the
controller, so that waiting is on the trail instead of being hand-edited into a file.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-14** — Blocking records a reason and hides the ticket from ready
```gherkin
Given ticket T-01-02 is in progress
When a user blocks it with a reason
Then its status becomes blocked and the trail records the reason and the actor
And the ready listing no longer offers it
```

**AC-15** — Unblocking returns it and the wait is measurable
```gherkin
Given ticket T-01-02 has been blocked and is then unblocked
When the trail is folded
Then the ticket returns to the state it was blocked from
And the elapsed time between the block and the unblock is derivable from the trail alone
```

## US-05 — The trail answers how the work actually flowed

As a portfolio owner, I want cycle time, review lag, blocked time and estimate bias derived
from events already on disk, so that flow is visible without anyone entering new data.

**Priority:** must
**Depends on:** US-04

### Acceptance criteria

**AC-16** — Per-ticket flow, from the trail alone
```gherkin
Given a feature whose trail holds start, submit, accept and block events
When the flow report runs
Then each ticket shows cycle time, time in review and time blocked
And no field in the report was entered by hand
```

**AC-17** — Estimate bias and aging work in progress
```gherkin
Given tickets carrying estimates and a trail carrying their real elapsed times
When the flow report runs
Then it shows actual against estimate per ticket and the feature's overall bias
And any ticket in progress longer than the configured threshold is listed as aging
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Portability | No dependency enters `ai-dlc-core`; every script stays stdlib-only Python 3 | T-02-02 |
| Compatibility | `pnpm test` and `pnpm typecheck` stay green with no file under `apps/` edited | T-03-04 |
| Safety | Evidence capture never writes an unbounded record and never stores raw output beyond the ceiling | T-02-02 |
| Reversibility | Every change is inert on a repo that does not opt in, so reverting means deleting one config block | T-03-04 |
