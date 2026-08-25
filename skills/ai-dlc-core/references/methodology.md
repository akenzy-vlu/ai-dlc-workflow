# Methodology

What happens inside each phase, and why each gate exists. The gate *preconditions* are
enforced by `scripts/aidlc.py`; this file is the reasoning behind them.

Run `aidlc status` before reading further — it tells you which phase you are actually in.
Never infer the phase from conversation history.

---

## Phase 0 — Discovery and intent

Split in two, in this order. Read `references/discovery-protocol.md` before starting.

### 0a — Discover the architecture

Never ask a human what the repo already says. Inventory it first:

```bash
# with a stack profile — richer, knows your framework's shared libraries
python <profile>/scripts/discover_repo.py <repo-root> -o .ai/architecture.md

# without one — works on any stack
python scripts/discover_generic.py <repo-root> -o .ai/architecture.md
```

Either produces a **draft** map: packages, detected stack, existing modules and their
layers, reusable components, entry points, and the naming conventions actually in use.
Reuse an existing `.ai/architecture.md` if it carries a `verified_by` value and is not
stale — regenerating over a human's corrections is worse than not running the script.

Then read past the inventory yourself. The closest existing module shows what a state
holder or handler looks like *here*, where domain code really lives, and how failures are
mapped. Note any inconsistency between modules rather than silently picking one: two
modules doing the same thing differently is the most common source of a plan that passes
review and then fails code review.

Anything discovery leaves ambiguous becomes a row in the assumption register in Phase 1.
"The repo has two candidate packages for domain code and I picked one" is an assumption,
not a detail.

### 0b — Ask what the repo cannot answer

Four core questions, plus up to three that discovery made possible. All in one message.

1. What pain does this remove, and for whom?
2. How will we know it worked — one measurable signal?
3. What is deliberately out of scope?
4. Any deadline, release train, or external dependency?

Cap the total at seven. Propose drafts rather than asking for essays — a user correcting
your inferred flow is faster and more accurate than one writing it from scratch. Allow one
follow-up round at most.

Unanswered questions are not a reason to stall. They become assumptions, marked blocking
where being wrong would force rework.

### 0c — Scaffold the feature

```bash
aidlc init <name> --profile <profile>      # → .ai/features/YYYYMMDDNN-<name>/
```

The directory carries the date planning started and that day's sequence, because a feature
name is not unique over time. The same name comes back two quarters later as a different
plan, and an undated folder would hand that plan the previous one's trail, gate and
tickets. The sequence is the day's highest number plus one rather than a count, so deleting
a feature never frees its number for a second plan to reuse. Re-running `init` with the
same name reopens the existing directory rather than minting a second one; pass
`--date YYYYMMDD` only when backfilling a plan that actually started earlier, or
`--date YYYYMMDDNN` to pin a specific slot.

Write `00-intent.md`. **Gate G0** — the architecture map exists and is signed, and the
intent is agreed.

## Phase 1 — Elaboration

Two artifacts, written together.

**`01-assumptions.md`** — the register. Every gap you filled, listed, with confidence and
blast radius. Mark blocking when being wrong forces rework of a Unit of Work or changes a
contract. A rejected assumption must produce a visible consequence: a new requirement, a
re-cut slice, a scope cut. Silent patching is the failure mode this table exists to prevent.

**`02-requirements.md`** — user stories with acceptance criteria in Given/When/Then. Each
criterion gets a stable id (`AC-01`, `AC-02`…) because tickets reference these ids and
traceability is computed from them.

**Gate G1** — refused while any blocking assumption is still pending, and refused if a
resolved assumption carries no resolution note saying who settled it and when.

## Phase 2 — Logical design

`03-logical-design.md` covers the chosen approach and the alternatives rejected with
reasons, the domain model, the API or data contract, state ownership, cache and offline
behaviour, an error taxonomy mapped to your language's failure type, and the observability
hooks. Any decision that is expensive to reverse becomes an ADR in the same file.

Design at the level of contracts and boundaries — not method bodies.

**Gate G2** — requires at least one ADR, none left at `proposed`.

## Phase 3 — Decomposition

**Step 3.1 — Cut Units of Work.** Slice vertically, 2–5 per feature. Each gets
`04-units-of-work/UOW-01-<slug>/uow.md` with YAML frontmatter and a **Demo script**.

Writing the demo script is the honest test of a slice. If you cannot describe someone
opening the product and seeing it work, you have cut horizontally, and it should be merged
into the slice that makes it visible.

**Step 3.2 — Write tickets.** Each UoW holds tickets in `tickets/T-<uow>-<n>.md`, carrying
`layer`, `type`, `estimate`, `depends_on`, `blocks`, `verifies` (criterion ids) and
`touches` (file paths). Cross-UoW dependencies are legal and expected — declare them rather
than hiding them by reordering.

Every `touches` path must appear in the architecture map, or be marked `# new` with the
convention it follows. `aidlc lint-touches` enforces this.

**Step 3.3 — Build and validate the graph.**

```bash
python scripts/uow_graph.py .ai/features/<slug> --write
python scripts/uow_graph.py .ai/features/<slug> --parallel
```

The script rejects duplicate ids, dangling dependencies, cycles, asymmetric
`depends_on`/`blocks`, oversized tickets and uncovered acceptance criteria. It computes
waves, the critical path, and write-conflict hazards, then regenerates
`05-ticket-graph.md`, `06-traceability.md` and `registry.yaml`.

Never hand-write the graph or the registry. Generate them, so they cannot drift from the
tickets. `aidlc check G3` refuses the gate if the generated files are absent.

**Gate G3** — present the wave table, the critical path and the coverage report, then ask
whether the sequencing matches how the work should actually ship. Passing G3 unlocks
construction; nothing before it does.

## Phase 4 — Construction

Work one UoW at a time, following wave order inside it.

```bash
aidlc ready                          # dependency-satisfied tickets
aidlc start  T-01-01 --by <who>      # → in_progress
aidlc submit T-01-01 --by <who>      # → review, after ticking the done-when boxes
aidlc accept T-01-01 --by <human>    # → done
```

An implementer cannot accept its own work. A ticket in `review` keeps its dependents
blocked, so review lag surfaces as stalled parallelism rather than as invisible debt.
Working solo, `aidlc done --no-review` still works and records the bypass in the audit
trail.

Check write-conflict hazards before running agents in parallel. Waves are topological
levels, not a schedule: two tickets in different waves with no dependency path between them
can still be in flight simultaneously, and if they touch the same file one side loses its
work.

At the end of each UoW, run its demo script in front of a human. **Gate G4** — all tickets
done and every UoW checklist ticked.

When reality contradicts the plan — and it will — run `aidlc reopen` with a reason and fix
the artifact before the code. A plan that silently diverges from the repo is worse than no
plan.

## Phase 5 — Close

Fold decisions made during construction back into `03-logical-design.md` as ADRs. Mark
every assumption with what actually turned out to be true. Run the profile's
definition-of-done checklist, or the tickets' own if there is no profile.

**Gate G5** — no assumption left pending, no ADR left proposed, graph still validating.

---

## Why each gate exists

**G0 — the map must be signed.** A draft architecture map is a set of filename heuristics.
Treating it as truth is how tickets end up naming directories that do not exist. Requiring
a human signature costs two minutes and removes an entire class of fictional plan.

**G1 — assumptions cannot be laundered.** The cheapest way to look finished is to convert
pending assumptions into facts. So a resolved assumption needs a note naming who settled
it. This is the gate that most often catches an over-eager plan, including one written by
an AI that meant well.

**G2 — a design with no ADR is under-examined.** If nothing in the approach was hard to
reverse, either the feature is trivial or the alternatives were never considered. Requiring
one ADR forces the second possibility into the open.

**G3 — the graph must compute.** Cycles, dangling dependencies, uncovered criteria and
oversized tickets are mechanically detectable, so no human should spend review attention on
them. What a human *should* review is the sequencing — which is why G3 presents waves and
the critical path rather than a list.

**G4 — demo before moving on.** A slice that cannot be demonstrated was not a slice. The
demo script is written at G3 precisely so that at G4 there is no room to renegotiate what
"done" meant.

**G5 — close the register.** Assumptions left pending forever are how the next feature
inherits the same unknowns. Recording what turned out to be true is the only part of this
process that compounds.
