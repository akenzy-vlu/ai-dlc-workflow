---
feature: aidlc-core-gate-hardening
adr_count: 6
---

# Logical design — AI-DLC core gate hardening

## Approach

One new primitive carries the whole feature: an **evidence record**, a line in
`history.jsonl` describing a command that ran — its ticket, actor, exit code, an output
digest, a bounded tail and a duration. Everything else is either something that writes one
(`submit`), something that reads one (`check_g4`, `aidlc evidence`), or a fold over the
trail that was always possible and never done (`aidlc flow`).

That keeps the change inside machinery that already exists and is already correct. The
trail is append-only, `merge=union`, deduplicated by id and sorted by `(ts, id)`;
`feature_lock` already holds the whole read-check-write; `write_atomic` already protects
the view. An evidence record is an ordinary event with a new `action`, so it inherits all
of that for free — no new file, no new merge rule, no new reconcile path.

The three refusals the review found missing then reduce to reading data the controller
already writes:

- **Self-acceptance** — `_transition` folds the trail for the ticket's last `ticket review`
  event and compares its `by` against the accepting actor, normalised for case and
  surrounding whitespace. Refuse on a match. No new state.
- **Unverified done** — `submit` resolves the ticket's verification command, runs it, and
  appends the result before deciding. A non-zero exit refuses the transition *and still
  records the run*, because a failing attempt is the most useful thing in the trail.
- **Unrecorded waiting** — `block` and `unblock` become real subcommands, and the block
  event carries the state it interrupted so `unblock` can restore it rather than guess.

Compatibility is per plan, not per repo (A-01). `init` stamps the tool's `RULESET` into
`.aidlc-state.yaml`; `check_g4` requires evidence only when that stamp is ≥ 5. A plan
carrying no stamp is treated as ruleset 4 and judged by today's rules, which is why no
existing plan in any repo changes verdict.

`aidlc flow` computes from the trail and stores nothing. Cycle time is
`accept − start`, review lag is `accept − submit`, blocked time is the summed
`unblock − block` spans, and estimate bias is cycle time minus the ticket's `estimate`.
`project_registry.py` projects the same three numbers into its `ticket` table so the
cross-repo report gains a time dimension without a second implementation.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Core ingests a report file (JUnit XML, JSON) produced by an external run instead of executing anything | The gap being closed is that the actor being gated writes its own verdict. A report file the same actor produces is the same hole in a different format. Executing is what makes the record independent of the claim |
| Evidence in a separate `evidence.jsonl` | Needs its own `merge=union` rule, its own dedupe, its own reconcile path, and a second thing that can drift from the trail. The trail already solves all four, and evidence is chronological like everything else in it |
| A cryptographic actor identity (signed approvals, SSH keys) | The threat is an agent following the locally plausible shortcut, not an adversary forging approvals. A refusal the agent cannot argue past is sufficient; key management would be the most fragile part of an otherwise dependency-free tool |
| Repo-level ruleset gating, bumping `.ai/aidlc.yaml` to 5 | The pin is shared by every feature in the repo, so bumping it applies new rules retroactively to plans already closed. A-01 requires per-plan behaviour, which requires a per-plan stamp |
| Storing computed flow metrics in `.aidlc-state.yaml` | The view exists to be foldable from the record. A stored metric is a second source of truth that a merge can damage and nothing would rebuild |
| Reusing the existing `verify:` config block | `verify:` belongs to `ai-dlc-verify`, which is explicitly out of scope. Sharing the key would couple two packages that this feature is deliberately keeping apart |
| A `blocked` flag alongside `status` | `blocked` is already a legal value of `status` in `VALID_STATUS` and in `ALLOWED_FROM`'s source sets. Adding a parallel flag would make two fields disagree |

## Contracts

### `.ai/aidlc.yaml` — the new `evidence:` block

Opt-in. Absent, every behaviour below degrades to exactly what the controller does today.

```yaml
evidence:
  command: "pnpm vitest run {tests}"   # {tests} <- the ticket's tests: list, space-joined
  timeout: 600                         # seconds; a timeout is a failed run, not a pass
  output_ceiling: 8192                 # bytes of tail retained; the digest covers everything
  aging_hours: 48                      # a ticket in progress longer than this is aging
```

The key is `evidence:` rather than `verify:` so `ai-dlc-verify` keeps sole ownership of its
own block. Parsing needs the mini-reader in `uow_graph.py` to handle one nested level; it
is deliberately not a YAML parser and must stay that way.

### The evidence record — one line of `history.jsonl`

```json
{"gate": "G4", "action": "evidence", "ticket": "T-01-01", "by": "claude",
 "command": "pnpm vitest run apps/api/test/skill-files.spec.ts",
 "exit": 0, "digest": "sha256:4f3c…", "tail": "…last 8192 bytes…",
 "duration_ms": 8421, "at": "2026-09-06T14:02:11",
 "ts": "2026-09-06T14:02:11.882014", "id": "9c1a77b0e412"}
```

`HISTORY_KEYS` gains `command`, `exit`, `digest` and `duration_ms` so `entry_id` covers
them — without that, two runs of the same ticket in the same second hash identically and
`read_history`'s dedupe silently drops one. `tail` is excluded from the id on purpose: it
is evidence for a human, not identity. `save_state`'s key whitelist is left alone, so the
YAML view stays a summary and the detail lives only in the record.

### CLI surface

```bash
aidlc block   T-01-02 --by <name> --reason <text>   # status -> blocked, prior state recorded
aidlc unblock T-01-02 --by <name>                   # restores the state the block interrupted
aidlc evidence T-01-01                              # the recorded runs for one ticket
aidlc flow [--aging-hours N]                        # cycle time, review lag, blocked, bias
```

`ALLOWED_FROM` gains `"blocked": {"todo", "in_progress", "review"}`. `unblock` does not
appear there: it reads the block event's `from` field and restores it, so no new
transition rule is needed and a block can never lose a ticket's place.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Evidence records | `history.jsonl` | Permanent, append-only |
| The state a block interrupted | the block event's `from` field | Until the matching unblock |
| A plan's ruleset | `.aidlc-state.yaml`, stamped once at `init` | The life of the plan |
| Flow metrics | nothing — computed per invocation | The command's output |
| `ticket.cycle_hours` / `review_hours` / `blocked_hours` | `project_registry.py`'s disposable tables | Rebuilt every scan |

## Error taxonomy

| Condition | Result | Exit |
| --- | --- | --- |
| Accepting actor matches the submitter | refused; message names the submitter and the rule | 1 |
| Verification command exits non-zero | refused; the failing run is recorded first | 1 |
| Verification command not found, or not executable | refused; recorded as a failure to start, `exit: null` | 1 |
| Verification command exceeds `timeout` | refused; recorded with the timeout as the reason | 1 |
| `evidence:` absent from the repo config | proceed exactly as today; one line saying verification is not configured | 0 |
| `evidence.command` present but the ticket has no `tests:` | warn and proceed; a ticket with nothing to run is not a failing ticket | 0 |
| G4 on a ruleset-5 plan with a ticket lacking a passing run | gate fails, naming the ticket | 1 |
| G4 on a plan stamped ruleset 4, or unstamped | judged under ruleset-4 rules; migration hint printed | 0 |
| `unblock` with no matching block event | refused; nothing to restore | 1 |
| `flow` on a plan below G3 | prints the gate and stops; there are no tickets to measure | 0 |

## Observability

`aidlc status` gains one line under the ticket counts — how many tickets carry a passing
run, and how many are aging past `aging_hours`. `aidlc audit` renders evidence events as
`ticket · exit · duration` rather than dumping the tail. `project_registry.py --report`
gains a **Flow** section (median cycle time, review lag, estimate bias per repo) and a
**Stuck** section (aging and blocked tickets across every repo), which is where the
portfolio-level answer the review asked for actually surfaces.

## ADRs

### ADR-01 — `submit` executes the verification command itself
**Context:** G4's weakness is that the actor being gated also writes the verdict. Evidence
that the same actor produces out-of-band inherits the weakness.
**Decision:** The controller runs the command and records the result. It is opt-in per repo
via `evidence:`, and absent that block nothing executes.
**Consequences:** The controller gains a subprocess trust surface it never had — accepted
because it already shells out to `uow_graph.py`, and because a repo that does not opt in is
byte-for-byte unaffected. A slow suite now makes `submit` slow, bounded by `timeout`.
**Status:** accepted

### ADR-02 — Evidence records live in `history.jsonl`
**Context:** Evidence needs append-only semantics, conflict-free merges, dedupe and a
rebuild path. The trail has all four and is already declared `merge=union`.
**Decision:** An evidence record is an ordinary trail event with `action: "evidence"`.
`HISTORY_KEYS` is extended so its identity covers the run, and `fold_gate` ignores it.
**Consequences:** No new file and no new merge rule. `entry_id` changes shape, so an
entry with no stored `id` would hash differently than before — only reachable for
pre-trail backfilled entries, which are re-stamped on write and therefore already carry one.
**Status:** accepted

### ADR-03 — Ruleset is stamped per plan at `init`
**Context:** `check_ruleset` only warns, and its pin is repo-level, so a bump applies new
rules to every plan in the repo including closed ones (A-12).
**Decision:** `init` writes the tool's `RULESET` into `.aidlc-state.yaml`. `check_g4`
requires evidence only at ≥ 5. An absent stamp means 4.
**Consequences:** Core carries two rule sets for G4 and must keep doing so. The repo-level
pin keeps its existing advisory meaning; the two are not merged, which is mildly redundant
and much safer than making one mean the other.
**Status:** accepted

### ADR-04 — Actor identity stays a normalised string
**Context:** `--by` is free text. Nothing stops an agent typing a human's name.
**Decision:** Compare normalised strings and refuse a match. Optionally check the accepting
actor against a `reviewers:` list when the repo declares one. No keys, no signatures.
**Consequences:** A determined agent can still impersonate a human by typing their name.
Accepted: the failure mode this guards is the plausible shortcut, not forgery, and the
attempt is on the record either way. Names differing only by case or spacing are the same
actor, which is what AC-04 asserts.
**Status:** accepted

### ADR-05 — Flow metrics are computed, never stored
**Context:** The trail already holds every timestamp and actor needed.
**Decision:** `aidlc flow` folds the trail on each invocation. `project_registry.py`
projects the same numbers into its disposable tables, and nothing is written into
`.aidlc-state.yaml`.
**Consequences:** Metrics can never disagree with the record, and the registry stays
"drop it and re-scan for an identical result". Cost is recomputation, which is trivial at
the scale of a few hundred events.
**Status:** accepted

### ADR-06 — A blocked ticket records the state it interrupted
**Context:** `blocked` is reachable from `todo`, `in_progress` and `review`. Restoring to a
fixed state on unblock would silently demote a ticket that was already in review.
**Decision:** The block event carries `from`; `unblock` restores it and refuses when no
matching block exists.
**Consequences:** `unblock` needs no entry in `ALLOWED_FROM`, and blocked spans are
computable by pairing events. A hand-edited `status: blocked` has no block event, so
`unblock` refuses it — which is the intended pressure toward using the controller.
**Status:** accepted
