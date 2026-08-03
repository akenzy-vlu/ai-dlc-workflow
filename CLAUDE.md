# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This repo holds two **Claude Code skill packages**, not an application:

```
ai-dlc-core/                  stack-agnostic feature-planning workflow
├── SKILL.md
├── references/
│   ├── methodology.md        what each phase does, why each gate exists
│   ├── templates.md          artifact/frontmatter shapes — source of truth for schema
│   ├── discovery-protocol.md discoverable-vs-undiscoverable framing for Phase 0
│   ├── sync.md                how a target repo's .ai/ reaches a central report
│   └── profile-contract.md   the interface a stack profile must implement
└── scripts/
    ├── aidlc.py               controller: gate state, ticket review, snapshot
    ├── uow_graph.py           graph validator/generator, write-conflict hazards, ruleset pin
    ├── project_registry.py    cross-repo read model: --scan / --ingest / --report
    └── discover_generic.py    read-only repo inventory, any stack

examples/profile-flutter/    EXAMPLE stack profile — reference impl of the contract below,
├── SKILL.md                       for one specific (fictional/sample) Flutter monorepo,
├── references/                    not a profile shipped for real use
│   └── flutter-rules.md      layer boundaries, BLoC shape, reuse inventory, concrete DoD
└── scripts/
    └── discover_repo.py      UTSer-specific inventory (utse_ui_kit, segmentOf() routes, ...)

PILOT-RUNBOOK.md              end-to-end dry run of both packages against a real repo — read first
README.md                     one-line pointer from flutter-rules.md to the profile contract
```

`ai-dlc-core` implements **AI-DLC** (Inception → Construction → Operations): a feature moves
through six gates (`G0`…`G5`), and `scripts/aidlc.py` refuses to advance a gate or unlock
construction commands until machine-checkable preconditions are met.

`examples/profile-utser-flutter` is an **example stack profile** — it lives under `examples/`
because it demonstrates the shape a profile must take (per
`ai-dlc-core/references/profile-contract.md`), not because it's a profile actively deployed
against a real repo in this codebase. Treat it as the reference implementation to copy when
writing a *real* profile for an actual stack: a profile is a separate skill that depends on
`ai-dlc-core` for the workflow itself and supplies only what's specific to one repo —
conventions, a concrete definition-of-done, and its own discovery script. Core knows nothing
about Flutter or any other framework; the layer vocabulary is the only stack-specific value it
reads, and it comes from `.ai/aidlc.yaml` in the *target* repo (not from here).

There is no build step, package manifest, or test suite anywhere in this repo. Everything is
**stdlib-only Python 3**. `ai-dlc-core` is meant to be copied (or symlinked) into
`~/.claude/skills/` — e.g. `cp -r ai-dlc-core ~/.claude/skills/` — and run against some
*other* repository's `.ai/` directory (see `PILOT-RUNBOOK.md`, Part 1). A real profile,
modeled on `examples/profile-utser-flutter`, gets copied alongside it the same way. When
you're asked to modify the `ai-dlc-core` scripts, you're changing tooling that other repos'
planning sessions depend on — treat `RULESET` bumps and frontmatter-schema changes as breaking
changes (see below).

## Commands

No package manager, no build, no test runner. Everything is invoked directly. Paths below are
relative to the repo root:

```bash
# Syntax-check a script after editing it (there is no test suite)
python3 -m py_compile ai-dlc-core/scripts/aidlc.py

# Run the gate controller against a feature directory (in some *other* repo)
python3 ai-dlc-core/scripts/aidlc.py -d <repo>/.ai/features/<slug> status
python3 ai-dlc-core/scripts/aidlc.py -d <repo>/.ai/features/<slug> check G1
python3 ai-dlc-core/scripts/aidlc.py -d <repo>/.ai/features/<slug> pass G1 --by <name>

# Validate/generate the ticket graph directly
python3 ai-dlc-core/scripts/uow_graph.py <repo>/.ai/features/<slug> --write
python3 ai-dlc-core/scripts/uow_graph.py <repo>/.ai/features/<slug> --parallel   # write-conflict hazards
python3 ai-dlc-core/scripts/uow_graph.py --version                              # → uow_graph X.Y.Z (ruleset N)

# Inventory a repo with no stack profile yet
python3 ai-dlc-core/scripts/discover_generic.py <repo-root> -o <repo>/.ai/architecture.md

# Inventory the UTSer Flutter monorepo specifically (richer: utse_ui_kit, segmentOf() routes) —
# example only; a real repo would use its own profile's discover_repo.py the same way
python3 examples/profile-utser-flutter/scripts/discover_repo.py <repo-root> -o <repo>/.ai/architecture.md

# Build/query the cross-repo read model
python3 ai-dlc-core/scripts/project_registry.py --db plans.db --scan <repo-root>:<label>
python3 ai-dlc-core/scripts/project_registry.py --db plans.db --report
```

There is no automated test suite (verified: no `*test*` files in the repo). Validate changes
to a script by running it end-to-end against a scratch `.ai/features/<slug>` directory (see
`PILOT-RUNBOOK.md` for the exact walkthrough that was used to dry-run this system, including
a real bug it caught) and by running `python3 -m py_compile` on anything you touch.

## Architecture

### The controller pattern, and why it's structured this way

The core design decision (stated explicitly in `ai-dlc-core/SKILL.md`) is that **gates are
enforced by a program, not by prose**. An instruction like "don't implement before G3" gets
agreed to and then skipped by an agent under time pressure; a state file that a script refuses
to advance without satisfying machine-checkable preconditions does not. Every script here is
stdlib-only and read-mostly (discovery scripts never write outside their `-o` target) so that
the controller itself can't become a new thing to trust blindly.

Concretely:

- **`aidlc.py`** owns `.aidlc-state.yaml` inside a feature directory (`.ai/features/<slug>/`
  in the target repo). It tracks the current gate (`G0`…`G5`) and an append-only `history` of
  who passed/reopened what and when. `CHECKS = {"G0": check_g0, ...}` (near the bottom of the
  file) is the actual precondition logic per gate — read that dict and its functions, not
  `SKILL.md`'s table, when you need the exact rule. State transitions only move forward
  (`pass`) or explicitly backward with a recorded reason (`reopen`); there is no way to jump
  a gate. Ticket lifecycle (`start`/`submit`/`accept`/`reject`/`done`) is a second, separate
  state machine gated by `ALLOWED_FROM`, enforcing that only a human can `accept` (never the
  same actor that `submit`ted) unless `--no-review` is passed, which itself gets recorded in
  the audit trail rather than hidden.
- **`uow_graph.py`** is the thing `aidlc.py` shells out to (via `run_uow_graph`, a
  subprocess call resolved relative to `aidlc.py`'s own directory — both scripts must stay
  siblings inside `ai-dlc-core/scripts/`) for G3 and G5 checks, and is also runnable
  standalone. It has its own tiny YAML-subset frontmatter parser (`parse_frontmatter`) —
  deliberately not a real YAML parser, since the schema is fixed and controlled. It loads
  every `04-units-of-work/UOW-*/uow.md` and `tickets/T-*.md`, validates cross-references
  (`depends_on`/`blocks` symmetry, unknown ids, cycles via Kahn's algorithm, AC coverage,
  ticket-hour ceilings, UoW elapsed-time ceilings, write-conflict hazards between tickets with
  no ordering constraint), then — only with `--write` — regenerates three derived files:
  `05-ticket-graph.md`, `06-traceability.md`, `registry.yaml`. **Never hand-edit those
  three**; they're regenerated from the tickets specifically so they can't drift from them.
- **`aidlc.py` reuses `uow_graph.py`'s parser by importing it** (`parse_frontmatter_files`,
  `_critical_hours` insert `ai-dlc-core/scripts/` onto `sys.path` at runtime) rather than
  reimplementing frontmatter parsing, so the two scripts can never disagree about what a
  ticket says. If you change `parse_frontmatter` or `load_plan` in `uow_graph.py`, you are
  changing what `aidlc.py` sees too.
- **`project_registry.py`** builds a *disposable* SQLite read model (drop it, re-scan, get an
  identical result — nothing is ever written there that isn't recoverable from files) across
  potentially many repos' `.ai/` directories. It intentionally does **not** parse the
  generated `registry.yaml` for its `--scan` path — it re-derives everything from the
  hand-written tickets via `uow_graph.load_plan` (imported the same way `aidlc.py` does), so a
  repo that `.gitignore`s its generated artifacts (the recommended setup, per
  `ai-dlc-core/references/sync.md`) still reports correctly. Two tables, `gate_event` and
  `snapshot_log`, are the sole exception to "disposable": they're `INSERT OR IGNORE`
  (append-only, deduplicated on natural key) because when a target repo doesn't commit `.ai/`
  to git, the JSON snapshot stream is the *only* durable copy of who approved what.
- **`discover_generic.py`** (in `ai-dlc-core`) and **`discover_repo.py`** (Flutter-specific,
  in the `examples/profile-utser-flutter` example) never write anything except their `-o`
  target. Their output is
  explicitly a **draft** — a human must fill `verified_by` in the frontmatter before
  `check_g0` in `aidlc.py` will pass. This is a deliberate trust boundary: heuristics can
  guess a layer convention from filenames, they cannot tell a live convention from a legacy
  one. A profile's own `discover_repo.py` always beats the generic fallback when one exists —
  the fallback is for piloting on a repo with no profile yet.

### Versioning discipline: `RULESET`

`uow_graph.py` defines `RULESET = 4` and `check_ruleset()` refuses to silently re-judge a
plan authored under different validation rules — the target repo pins its ruleset in
`.ai/aidlc.yaml`, and a mismatch is surfaced as an explicit warning rather than a mysterious
new failure. **Bump `RULESET` whenever you change validation in a way that could make a
previously-valid plan fail**, and bump `__version__` for any other change. This is the one
number that must not be changed casually — it's the seam that lets this tooling evolve
without silently invalidating plans in every repo that uses it.

### Frontmatter schemas are contracts

The YAML-ish frontmatter keys in `00-intent.md`, `01-assumptions.md` (table columns, in a
fixed order), `uow.md`, and ticket files are parsed by regex/line-based logic in both
`aidlc.py` and `uow_graph.py`, not a real parser. A typo in a key name, a reordered
assumption-table column, or a renamed section heading (e.g. `REQUIRED_INTENT_SECTIONS`,
`REQUIRED_DESIGN_SECTIONS` in `aidlc.py`) breaks the graph or a gate check silently returning
"missing" rather than erroring loudly. `ai-dlc-core/references/templates.md` is the canonical
shape reference — if you change what a script expects, update `templates.md` in the same
change, and bump `RULESET` if the change affects validation of existing plans.

### Reading order for reference docs

These are read by the *skill*, at the phase that needs them — not meant to be read cover to
cover:

- `ai-dlc-core/references/methodology.md` — what each phase (0–5) does and why each gate
  exists; read this to understand intended behavior before changing a `check_gN` function in
  `aidlc.py`.
- `ai-dlc-core/references/discovery-protocol.md` — discoverable-vs-undiscoverable framing for
  Phase 0.
- `ai-dlc-core/references/templates.md` — the artifact/frontmatter shapes; **the source of
  truth for schema**.
- `ai-dlc-core/references/profile-contract.md` — the interface a stack profile (e.g.
  `examples/profile-utser-flutter/`) must implement: `SKILL.md` + `references/<stack>-rules.md`
  + `scripts/discover_repo.py`.
- `ai-dlc-core/references/sync.md` — how a target repo gets its `.ai/` plan state into a
  central report (commit to git and let `project_registry.py --scan` pull, or emit portable
  JSON via `aidlc snapshot` and push); explains the `.gitignore` convention for the three
  generated files.
- `examples/profile-utser-flutter/references/flutter-rules.md` — layer boundaries, BLoC shape,
  the `utse_ui_kit` reuse inventory, banned-construct table, and the concrete
  definition-of-done for the example UTSer monorepo — read this as the model for a real
  `<stack>-rules.md` when writing a new profile.
- `PILOT-RUNBOOK.md` (repo root) — an end-to-end dry run of both packages together on a real
  repo, including a documented bug found during that run (the frontmatter parser was
  stripping `# new` comment markers off `touches` list items). Read this first — it's a
  working example of every command in sequence with expected output.

### Working across the skill/profile boundary

`ai-dlc-core` is the methodology (gates, graph, controller); a stack profile is taste
(conventions, DoD, its own discovery script) for one specific repo. `examples/profile-utser-flutter`
is that shape worked out for a sample Flutter monorepo — read it as a worked example, not as
something to register against a real project. Don't add framework-specific logic to
`ai-dlc-core` — it belongs in a profile. Conversely, don't duplicate workflow/gate logic into a
profile; the example's `SKILL.md` is deliberately thin and defers to `ai-dlc-core` for
everything except conventions and discovery. A new, real stack profile follows the same
shape — see `ai-dlc-core/references/profile-contract.md`, in particular the requirement that a
profile's `SKILL.md` name concrete path markers (e.g. `apps/utser`, `packages/utse_*`) so it
doesn't get picked for the wrong repo.
