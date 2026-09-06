# Artifact templates

Copy these shapes exactly. The frontmatter schemas are contracts — `scripts/uow_graph.py`
and `scripts/aidlc.py` parse them, so a typo in a key name breaks the graph.

## Contents

- [00-intent.md](#00-intentmd)
- [01-assumptions.md](#01-assumptionsmd)
- [02-requirements.md](#02-requirementsmd)
- [03-logical-design.md](#03-logical-designmd)
- [uow.md](#uowmd) — Unit of Work
- [Ticket](#ticket) — `T-<uow>-<n>.md`
- [Generated artifacts](#generated-artifacts)
- [Id conventions](#id-conventions)

---

## 00-intent.md

```markdown
---
feature: course-registration          # the name, as a human says it
slug: 2026072401-course-registration  # the directory name — the feature's identity
owner: <name>
created: 2026-07-24
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Course Registration

## Problem
[The pain, stated from the user's side. Not the solution.]

## Affected personas
| Persona | Current behaviour                   | Desired behaviour                   |
| ------- | ----------------------------------- | ----------------------------------- |
| Parent  | Calls the school office to register | Registers in-app in under 2 minutes |

## Success signal
[One measurable thing. "80% of registrations happen in-app within 30 days."]

## Out of scope
- [Explicitly excluded, with a one-line reason each]

## Constraints
| Kind     | Detail                                                     |
| -------- | ---------------------------------------------------------- |
| Deadline | Store submission by <date>                                 |
| External | Registration API owned by another team, contract not final |
| Platform | Must work offline for read; write requires connectivity    |

## Existing surface touched
- Reused components: (from the architecture map)
- Adjacent features: `course-list` (shares the Course model)
- Entry points: one new route
```

---

## 01-assumptions.md

The register is the reason this methodology beats "just start coding". Every gap you
filled without asking belongs here.

```markdown
---
feature: course-registration
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

| ID   | Assumption                                                      | Confidence | Blocking | Blast radius if wrong                | Status    | Resolution                      |
| ---- | --------------------------------------------------------------- | ---------- | -------- | ------------------------------------ | --------- | ------------------------------- |
| A-01 | Registration API returns the full course object, not just an id | low        | yes      | UOW-02 data layer + contract rewrite | pending   | —                               |
| A-02 | A student may register for at most one section per course       | medium     | yes      | Validation rules, UI selection model | confirmed | Confirmed by <name>, 2026-07-24 |
| A-03 | Registration window is enforced server-side                     | high       | no       | Client shows a stale button          | pending   | —                               |

## Rejected assumptions

| ID   | What we assumed  | What is actually true                     | Consequence                   |
| ---- | ---------------- | ----------------------------------------- | ----------------------------- |
| A-04 | Parents register | Only students register; parents view only | UOW-03 dropped, AC-07 removed |
```

Rules:
- `blocking: yes` when being wrong forces rework of a UoW or changes a contract.
- Never move an assumption to `confirmed` yourself. Only the human can.
- A rejection produces a visible consequence — a dropped AC, a new UoW, a scope cut.
  Silent patching is the failure mode this table exists to prevent.

---

## 02-requirements.md

```markdown
---
feature: course-registration
stories: 3
acceptance_criteria: 9
---

# Requirements — Course Registration

## US-01 — Browse open courses

As a student, I want to see the courses open for registration
so that I can choose before the window closes.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Happy path
```gherkin
Given I am authenticated and the registration window is open
When I open the registration screen
Then I see the list of open courses with name, credits, and remaining seats
```

**AC-02** — Empty
```gherkin
Given no courses are open
When I open the registration screen
Then I see an empty state explaining when the next window opens
```

**AC-03** — Offline
```gherkin
Given I have no connectivity and a cached list exists
When I open the registration screen
Then I see the cached list with a stale-data indicator
And the register button is disabled
```

## US-02 — Register for a course
...

## Non-functional

| Kind          | Requirement                                               | Verified by |
| ------------- | --------------------------------------------------------- | ----------- |
| Performance   | List renders in < 300 ms on cached data                   | T-01-04     |
| Accessibility | All actions reachable with screen reader labels           | T-03-02     |
| Telemetry     | `registration_submitted` event with course id and outcome | T-02-05     |
```

Every AC id must end up in at least one ticket's `verifies` list. The script checks this.

---

## 03-logical-design.md

```markdown
---
feature: course-registration
adr_count: 2
---

# Logical design — Course Registration

## Approach
[The chosen shape, in a paragraph.]

## Alternatives rejected
| Option                      | Why not                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| Local-first with sync queue | Registration is a contended write; last-write-wins is wrong here |

## Domain model
| Entity                | Fields                                    | Notes                                    |
| --------------------- | ----------------------------------------- | ---------------------------------------- |
| `RegistrableCourse`   | id, name, credits, seatsRemaining, window | Value object, immutable                  |
| `RegistrationOutcome` | status, reason                            | Sealed: accepted / waitlisted / rejected |

## Contracts
### GET /v1/registration/courses
Request: `?termId=<string>`
Response 200:
```json
{ "courses": [{ "id": "...", "name": "...", "credits": 3, "seatsRemaining": 12 }] }
```
Failure modes: 401 → `AuthFailure`, 409 → `WindowClosedFailure`, 5xx → `ServerFailure`

## State ownership
| State             | Owner               | Lifetime                  |
| ----------------- | ------------------- | ------------------------- |
| Course list       | `RegistrationBloc`  | Screen                    |
| Selected sections | `RegistrationBloc`  | Screen, cleared on submit |
| Auth token        | existing `AuthBloc` | App                       |

## Error taxonomy
| Condition                | Failure subtype          | UI                          |
| ------------------------ | ------------------------ | --------------------------- |
| No network               | `NetworkFailure`         | `AppErrorState` with retry  |
| Seat taken during submit | `SeatUnavailableFailure` | Inline banner, refresh list |

## Cache & offline
[What is cached, where, invalidation rule, staleness policy.]

## Observability
[Events, metrics, and what a failed registration looks like in logs.]

## ADRs

### ADR-01 — Submit is server-authoritative
**Context:** Seats are contended.
**Decision:** No optimistic UI on submit; show pending until the server answers.
**Consequences:** Slower perceived UX; eliminates a whole class of rollback bugs.
**Status:** accepted
```

---

## uow.md

Path: `04-units-of-work/UOW-01-<slug>/uow.md`

```markdown
---
id: UOW-01
slug: browse-open-courses
title: Student can browse open courses
demoable: true                  # must be true — if you cannot demo it, it is not a UoW
duration: 1d                    # ≤ 1d
depends_on: []                  # other UOW ids
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03]
risk: medium                    # low | medium | high
status: todo                    # todo | in_progress | blocked | review | done
rollback: feature flag `registration_v1` off → entry point hidden
---

# UOW-01 — Student can browse open courses

## Demo script
1. Log in as a student in the staging term
2. Tap Registration from the home quick access
3. See the open course list; pull to refresh
4. Turn on airplane mode, reopen → cached list with stale indicator

## In scope
- Read path end to end: API → repository → state holder → list UI with all four states

## Not in scope
- Submitting a registration (UOW-02)

## Risks
| Risk                      | Mitigation                                                     |
| ------------------------- | -------------------------------------------------------------- |
| Contract not final (A-01) | Ticket T-01-02 codes against a mock; swap is a one-file change |

## Definition of done
- [ ] All of AC-01..03 pass
- [ ] Four states render: loading skeleton, loaded, empty, failure
- [ ] The profile's definition-of-done checklist passes
- [ ] Demoed and accepted at gate G4
```

---

## Ticket

Path: `04-units-of-work/UOW-01-<slug>/tickets/T-01-02.md`

```markdown
---
id: T-01-02
uow: UOW-01
title: RegistrationRemoteDataSource + RegistrableCourseModel
layer: data                  # from the `layers` list in .ai/aidlc.yaml
type: feature                # feature | refactor | spike | test | chore
estimate: 3h                 # ≤ 4h
status: todo                 # todo | in_progress | blocked | review | done
depends_on: [T-01-01]        # ticket ids, may cross UoW
blocks: [T-01-03]            # must mirror the other ticket's depends_on
verifies: [AC-01, AC-03]     # AC ids from 02-requirements.md
tests:                       # what proves this ticket; feeds {tests} in the repo's command
  - test/registration/registration_remote_ds.spec.ts
touches:                     # must exist in .ai/architecture.md, or be marked new
  - src/registration/data/models/registrable_course_model.ts
  - src/registration/data/registration_remote_ds.ts   # new; matches the orders feature
assumptions: [A-01]          # register entries this ticket rides on
---

# T-01-02 — RegistrationRemoteDataSource + model

## Context
Depends on the entity from T-01-01. Contract is provisional — see A-01; code against
the mock in `test/fixtures/registration_courses.json` so the swap is isolated.

## Implementation notes
- The model maps `seats_remaining` → `seatsRemaining`
- Map HTTP status to the failure taxonomy in `03-logical-design.md`
- No business rules here — mapping and transport only

## Done when
- [ ] Round-trip test passes on the fixture
- [ ] 401 / 409 / 500 each produce the correct `Failure` subtype in tests
- [ ] No framework or UI import in this file
```

Write the ticket so someone who was not in the planning conversation can pick it up
cold. If the body only makes sense to you today, it is not finished.

### `tests:` and the verification run

`tests:` is what turns a done-when checkbox from a claim into a check. When the repo
configures an `evidence:` block (below), `submit` — and a solo `done --no-review` —
substitutes this list into the repo's command, runs it, and appends the result to
`history.jsonl`. A non-zero exit refuses the transition; the run is recorded either way,
because a failing run is the most useful thing in the trail.

A ticket with no `tests:` is not an error. The command simply resolves to nothing, the
controller says so, and the transition proceeds — a ticket with nothing to run is not a
failing ticket. It also has no passing run, so at ruleset 5 the G4 check names it rather
than passing it silently.

## The `evidence:` block

In the repo's `.ai/aidlc.yaml`, beside `layers:`. Entirely optional — a repo without it
behaves exactly as it did before verification existed, which is a supported state and not
an unfinished setup.

```yaml
evidence:
  command: "pnpm vitest run {tests}"   # {tests} <- the ticket's tests: list, space-joined
  timeout: 600                         # seconds; a timeout is a failed run, never a pass
  output_ceiling: 8192                 # bytes of output tail kept on the record
  aging_hours: 48                      # a ticket in progress longer than this is aging
```

The key is `evidence:`, not `verify:` — `verify:` belongs to the `ai-dlc-verify` package
and the two are independent.

Three states, and the third is why a typo cannot pass for a decision:

| The block | What happens |
| --------- | ------------ |
| absent | nothing runs, one informational line, the transition proceeds |
| present and valid | the command runs; a non-zero exit refuses the transition |
| present and malformed | the transition is **refused** — a broken config never degrades into "not configured" |

Only one nested level is parsed. This is a fixed schema read by regex, not YAML, and a
deeper block is reported as an error rather than half-understood.

**Output on the record.** The trail keeps a `sha256` of the whole output plus the last
`output_ceiling` bytes of it. That tail goes into `history.jsonl`, which is usually
committed — so a test that prints a token on failure prints it into your repository.
Lower the ceiling, or stop printing secrets, before you turn this on.

---

## Generated artifacts

Do not hand-write these. `scripts/uow_graph.py --write` produces them.

- **`05-ticket-graph.md`** — Mermaid DAG grouped by UoW, wave table (what runs in
  parallel), critical path, effort totals.
- **`06-traceability.md`** — AC → UoW → ticket → test matrix, plus uncovered ACs.
- **`registry.yaml`** — machine-readable snapshot for tooling and MCP queries.

---

## Id conventions

| Kind                 | Format              | Example                          |
| -------------------- | ------------------- | -------------------------------- |
| Feature name         | kebab-case          | `course-registration`            |
| Feature directory    | `YYYYMMDDNN-<name>` | `2026072401-course-registration` |
| Feature slug         | the directory name  | `2026072401-course-registration` |
| User story           | `US-<nn>`           | `US-01`                          |
| Acceptance criterion | `AC-<nn>`           | `AC-03`                          |
| Assumption           | `A-<nn>`            | `A-01`                           |
| ADR                  | `ADR-<nn>`          | `ADR-02`                         |
| Unit of Work         | `UOW-<nn>`          | `UOW-02`                         |
| Ticket               | `T-<uow nn>-<nn>`   | `T-02-04`                        |

`NN` is that day's sequence, taken as the day's highest number plus one — never a count,
so a deleted feature does not hand its number to the next one.

Ids are stable and never reused. Deleting a ticket leaves a gap in the numbering —
that is fine, and better than renumbering things other files point at.

---

## What the controller checks

| Artifact               | Checked at | Requirement                                                                                         |
| ---------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `00-intent.md`         | G0         | Problem, Success signal, Out of scope sections; no `TODO` left                                      |
| `01-assumptions.md`    | G1, G5     | ≥1 row; none blocking-and-pending; resolved rows carry a resolution note                            |
| `02-requirements.md`   | G1         | ≥1 `AC-nn` id; no `TODO` left                                                                       |
| `03-logical-design.md` | G2, G5     | Approach, Alternatives rejected, Error taxonomy; ≥1 ADR; none `proposed`                            |
| `uow.md`               | G3, G4     | `demoable: true`; a Demo script section; DoD fully ticked at G4                                     |
| Ticket                 | G3, G4     | Valid layer/type/status; estimate ≤ ceiling; symmetric `depends_on`/`blocks`; a done-when checklist |
| Ticket (ruleset ≥ 5)   | G4         | A recorded verification run with exit 0, when the repo configures `evidence:` and the ticket has something to run |
| `.ai/aidlc.yaml`       | every run  | `layers` matches the repo; `ruleset` pinned to the tool's current ruleset                           |

A section heading the checker cannot find is a failed gate, so keep the heading text as
written above rather than paraphrasing it.
