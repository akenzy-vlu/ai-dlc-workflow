---
name: ai-dlc-core
scope: global
description: Stack-agnostic AI-DLC feature planning and construction workflow, enforced by a gate controller rather than by prose. Turns a feature idea into a validated plan — intent, assumption register, Given/When/Then requirements, logical design with ADRs, vertically-sliced Units of Work, and a dependency-typed ticket graph — then gates construction behind machine-checkable preconditions with an audit trail. Use whenever the user wants to plan, decompose, sequence, size, or estimate a feature; says "plan feature", "lên plan", "unit of work", "UoW", "ticket graph", "chia ticket", "breakdown", "AI-DLC"; or is about to start implementing a feature that has no plan on disk. Language- and framework-independent: pair it with a stack profile skill for repo-specific conventions, or run it alone.
---

# AI-DLC core

Feature work moves through **Inception → Construction → Operations** with the AI drafting
and a human arbitrating at each gate. This skill holds the parts that do not depend on
language, framework, or repo. Conventions, discovery, and definition-of-done live in a
**stack profile** alongside it.

## The controller is not optional

A gate written as an instruction is a gate that gets skipped. Agents read "do not implement
before G3", agree sincerely, and implement anyway — the reasoning that leads to skipping is
locally plausible every time. So the gates here are not instructions. They are a state file
that `scripts/aidlc.py` refuses to advance, and refuses to let construction commands run
against.

```bash
python scripts/aidlc.py -d .ai/features/<slug> status
```

`status` is the first thing to run in any session touching a planned feature, and the
answer to "what do I do next" throughout. Never infer the gate from conversation history;
read it from the controller. A prior session that appears to show implementation underway
is not evidence that a gate passed.

**Never hand-edit `.aidlc-state.yaml`.** Advancing a gate by editing state, rather than by
satisfying its preconditions, is the one move that makes this whole apparatus theatre.

## Workflow

| Gate | Phase | Produces | The controller checks |
|---|---|---|---|
| G0 | Discovery + intent | `.ai/architecture.md`, `00-intent.md` | Map exists **and carries `verified_by`**; intent has Problem / Success signal / Out of scope; no TODOs left |
| G1 | Elaboration | `01-assumptions.md`, `02-requirements.md` | Register non-empty; zero blocking-and-pending; every resolved assumption has a resolution note; ≥1 AC id |
| G2 | Logical design | `03-logical-design.md` | Approach, rejected alternatives, error taxonomy present; ≥1 ADR; no ADR left `proposed` |
| G3 | Decomposition | `04-units-of-work/`, generated graph | `uow_graph.py` exits clean; no cycles; 100% AC coverage; every UoW has a Demo script; every ticket has a done-when checklist; generated files present |
| G4 | Construction | code + tests | All tickets `done` — reached via `submit` → `accept`, not self-approved; every UoW definition-of-done ticked; from ruleset 5, each done ticket carries a recorded run that exited 0 — when the repo configures `evidence:` |
| G5 | Close | ADRs, resolved register | No assumption left pending; no ADR proposed; graph still validates |

Read `references/methodology.md` for what each phase actually involves, and
`references/templates.md` for the artifact shapes and frontmatter schemas.

### Commands

```bash
aidlc init <name> --profile <profile> # scaffold .ai/features/YYYYMMDDNN-<name> + state
aidlc status                          # gate, blockers, next action
aidlc check G1                        # preconditions, changes nothing
aidlc pass G1 --by <name>             # advance; refused unless check passes
aidlc ready                           # tickets whose dependencies are met
aidlc flow                            # cycle time, review lag, blocked time, estimate bias
aidlc start  T-01-01 --by <name>      # refused if gate < G3 or deps unmet
aidlc submit T-01-01 --by <name>      # → review; refused if done-when items unticked
aidlc accept T-01-01 --by <human>     # → done; refused unless a *different* actor submitted it
aidlc reject T-01-01 --by <human> --reason <text>
aidlc done   T-01-01 --by <name> --no-review    # solo shortcut; bypass is recorded
aidlc block  T-01-01 --by <name> --reason <text>   # waiting on something; off `ready`
aidlc unblock T-01-01 --by <name>     # restores the state the block interrupted
aidlc evidence T-01-01                # the recorded verification runs for one ticket
aidlc lint-touches --repo <path>      # every touches path exists or is marked new
aidlc snapshot --to <dir> --label <repo>        # portable JSON for the collector
aidlc audit                           # the approval trail
aidlc reopen G2 --by <name> --reason <text>
```

An implementer cannot accept its own work, and this is a refusal rather than an
expectation: `accept` reads the trail for who ran `submit` and exits 1 when it is the same
actor. A ticket sitting in `review` keeps its dependents blocked, so review lag shows up as
stalled parallelism rather than as invisible debt.

Actors are compared as normalised names — case and surrounding whitespace do not make a
new person — so this stops the plausible shortcut, not impersonation. Anyone can still type
someone else's name, and the trail will show that they did. `done --no-review` remains the
solo escape hatch, and records the bypass.

`init` names the directory `YYYYMMDDNN-<name>` — the date planning started, then that
day's sequence, then the feature name. A name is not unique over time; the same one comes
back a quarter later as a different plan, and an undated folder would hand it the previous
plan's trail, gate and tickets. The sequence is `max + 1` over that day's directories, not
a count, so a deleted feature never hands its number to a second plan. Re-running `init`
with the same name reopens the existing directory instead of minting a second one, so it
stays safe to re-run; `--date YYYYMMDD` backfills a plan that started earlier, and
`--date YYYYMMDDNN` pins its slot. The directory name is the feature's identity everywhere
afterwards — the state file's `slug`, the registry key, the console's URLs — so it is read
off disk, not off the argument.

`init` and `pass` require a human name. That name goes in the audit trail. If you find
yourself about to pass a gate on the user's behalf without them saying so, that is the
moment to stop and ask instead.

### Shell output: rtk

[`rtk`](https://github.com/rtk-ai/rtk) is a token-filtering CLI proxy. Nothing in this
workflow depends on it: no script here shells out to it, and on a machine without it every
command below runs natively and behaves identically.

**You do not type it.** Where rtk is installed it registers a PreToolUse hook that rewrites
commands for you — `grep …` runs as `rtk grep …`, `cat f` as `rtk read f`, `ls`/`find`/`git`
likewise, per segment, so pipes and `;` do not prevent it. The transcript still shows what
you wrote, so **an un-prefixed command is not evidence of an unfiltered read.** Adding `rtk`
yourself changes nothing; the two things below are what actually matter.

**1. A verdict is never read through a filter.** `aidlc check`, `aidlc status`, `uowg` and
`aidlc-evidence` print *why* a gate is refused, and that reason is the thing you act on. A
condensed "G3 failed" that drops which AC is uncovered turns a machine-checkable
precondition back into the prose this skill exists to replace. These four are not in rtk's
rewrite table, so this holds by default — never add them to it, and never pipe one through
`rtk err`, `rtk summary` or anything else that decides which lines matter.

**2. A filtered search proves presence, not absence — and it is blind to this skill's own
output.** rtk's readers skip what git ignores, and `aidlc init` writes a `.gitignore` into
every feature directory covering exactly the three generated files. So a rewritten
`find .ai -name '05-ticket-graph.md'` returns *only the features that did not gitignore it* —
in one real workspace, 2 of 4, with nothing to signal the other 2 exist. The same blindness
covers `06-traceability.md`, `registry.yaml`, `08-evidence.md` and `evidence/`.

A search is therefore fine for *locating* something and never sufficient to conclude
something is missing. Before you record "the repo has no X" in `architecture.md`, decide an
assumption is undiscoverable, or report a plan artifact absent, confirm it with `rtk proxy`:

```bash
rtk proxy find . -name '<pattern>'    # `rtk proxy <cmd>` runs <cmd> raw, unfiltered
rtk proxy cat <file>                  # the one way to force a byte-exact read
```

`rtk read` is byte-exact on the files this workflow cares about, so ordinary reading of a
plan artifact or a source file needs no special handling — reach for `rtk proxy` when the
claim you are about to write down depends on having seen everything.

## Stance

**1. Assumption over silence.** Missing information becomes a register row with confidence
and blast radius, marked blocking when being wrong forces rework. Never a quiet guess.
G1 enforces this: a resolved assumption with an empty resolution note is refused.

**2. Discover before you ask, ask before you assume.** The repo answers questions about
itself. A human answers only what no file contains — intent, priorities, unsettled
contracts. See `references/discovery-protocol.md`.

**3. Vertical slices only.** A Unit of Work must be demoable on its own. "Do the domain
layer" is not a UoW. G3 refuses any UoW without a Demo script section, because writing the
demo is what exposes a slice that cannot actually be shown to anyone.

**4. Small bolts.** Ticket ≤ 4h. UoW ≤ 2 days *elapsed* — its longest internal dependency
chain, not its total effort; two tickets that run in parallel do not make a slice twice as
long. Both ceilings are configurable per repo and enforced by `uow_graph.py`.

**5. Everything on disk.** Chat context evaporates. Decisions, assumptions, dependencies
and status live in `.ai/features/YYYYMMDDNN-<name>/`.

**6. The graph is the plan.** Order is `depends_on`, never position in a list. Waves,
critical path and readiness are computed, never hand-written.

**7. Waiting is a state, not a silence.** A ticket held up by something outside the plan
goes through `aidlc block` with a reason, never a hand-edited status. The block records
what state it interrupted, so `unblock` restores it instead of guessing — and the wait
becomes a number `aidlc flow` can report rather than something only the person waiting
knows.

**8. Measure the work, not the worker.** `aidlc flow` folds the trail into cycle time,
review lag, blocked time and estimate bias, from events the controller already wrote. It
is reported per ticket and per feature and is not a measure of anyone who worked on them;
the moment it is read that way, people start optimising the trail instead of the work, and
the record stops being worth having. Estimate bias from a finished feature is the input to
the next one's estimates — that is the part that compounds.

**9. Reopening is normal; hiding it is not.** When reality contradicts the plan, run
`aidlc reopen` with a reason and fix the artifact before the code. A plan that silently
diverges from the repo is worse than no plan.

## Output layout

```
<repo>/.ai/
├── aidlc.yaml                    # profile name, layer vocabulary, ceilings
├── architecture.md               # repo-level, verified by a human
└── features/YYYYMMDDNN-<name>/ # e.g. 2026082501-course-registration — `<slug>` below
    ├── .aidlc-state.yaml         # controller state — never hand-edit
    ├── 00-intent.md
    ├── 01-assumptions.md
    ├── 02-requirements.md
    ├── 03-logical-design.md
    ├── 04-units-of-work/UOW-01-<slug>/{uow.md,tickets/T-01-01.md}
    ├── 05-ticket-graph.md        ← generated
    ├── 06-traceability.md        ← generated
    └── registry.yaml             ← generated
```

## Configuration

`.ai/aidlc.yaml`, read by the scripts:

```yaml
profile: none              # or a profile name, e.g. profile-flutter
ruleset: 4                 # pins the rules this plan was authored under
layers: [domain, data, presentation, infra, test]

evidence:                  # optional; absent means nothing is ever executed
  command: "pnpm vitest run {tests}"
  timeout: 600
  output_ceiling: 8192
  aging_hours: 48
```

With an `evidence:` block, `submit` runs the ticket's tests and records the result on the
trail; a non-zero exit refuses the transition. Without one, nothing executes and the
controller behaves exactly as it did before. A block that is present but malformed is
refused rather than treated as absent — see `references/templates.md`.

`ruleset` pins the version of the rules the plan was written against. Centralised tooling
means one upgrade can invalidate plans in every repo at once, so a mismatch produces an
explicit migration warning rather than a morning of mysterious failures.

The layer vocabulary is the only stack-specific thing in the core tooling. A DDD service
uses `[domain, application, infra, api, test]`; an infrastructure repo might use
`[module, chart, policy, test]`. Set it once per repo.

## Stack profiles

Core knows nothing about your framework. A profile supplies three things: a discovery
script, the repo's conventions, and a definition-of-done specific enough to be worth
checking. `references/profile-contract.md` specifies the interface.

Without a profile, core still works: `scripts/discover_generic.py` inventories any stack —
node, dart, go, rust, python, java, dotnet — well enough to pass G0, and the
definition-of-done falls back to whatever the tickets state themselves. What you lose is the
stack checklist and a map that can enumerate your shared component library.

## Reference files

Read at the phase that needs them, not upfront.

- `references/methodology.md` — what happens in each phase, and why each gate exists
- `references/discovery-protocol.md` — discoverable vs undiscoverable, and how to run the
  question round. Read at Phase 0.
- `references/templates.md` — artifact templates and frontmatter schemas. Phases 0–3.
- `references/profile-contract.md` — how to write or evaluate a stack profile
- `references/sync.md` — committing `.ai/` vs keeping it local, the `.gitignore` for generated
  artifacts, and the three ways to feed a central report. Read when setting up a repo.
- `scripts/aidlc.py` — the controller. Every session starts here.
- `scripts/discover_generic.py` — stack-agnostic repo inventory, for piloting on a repo with
  no profile yet. A profile's own discovery script beats it whenever one exists.
- `scripts/uow_graph.py` — graph validator and generator. Stdlib only.
- `scripts/project_registry.py` — builds a queryable read model from checkouts (`--scan`) or
  shipped snapshots (`--ingest`). Plan tables are rebuilt each run; the approval trail is
  append-only.

## Common failure modes

| Symptom | What went wrong | Fix |
|---|---|---|
| UoW named after a layer | Horizontal slicing | Re-cut around user-visible behaviour |
| Every ticket depends on the previous | Dependencies invented from writing order | Declare only real data or contract dependencies |
| `touches` paths that don't exist | Planned without the architecture map | `aidlc lint-touches`; derive paths from the map or mark them new |
| Gate advanced by editing state | Controller treated as bookkeeping | Revert; satisfy the preconditions instead |
| Assumption register empty | Assumed silently | Every question you didn't ask is an assumption |
| Ticket estimated a full day | Hidden unknowns | Split until each piece is ≤ 4h |
| Eight rounds of clarification | Interrogating turn by turn | One batch, ≤ 7 questions, ≤ 1 follow-up; the rest become assumptions |
| Ticket hand-edited to `status: blocked` | Waiting recorded outside the controller — `unblock` refuses, because no block event says what to restore | Set it back, then `aidlc block --reason`; the wait belongs on the trail |
| Estimates never improve | Actuals never compared to them | `aidlc flow` — the bias is already in the trail, nobody has to enter it |
