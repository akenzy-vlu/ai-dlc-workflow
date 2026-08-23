# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This repo holds three **Claude Code skill packages**, not an application:

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

ai-dlc-verify/               browser verification for G4 — the same demo script, screenshotted
├── SKILL.md
├── references/
│   ├── verification-protocol.md  the three rungs; discoverable vs undiscoverable; pass rules
│   ├── config-schema.md      every key of the `verify:` block, and .ai/credentials.env
│   ├── login-recipes.md      none / form / clerk-hosted / storage-state, and their failures
│   └── templates.md          07-verification.md, the uow.md block, 08-evidence.md, PR draft
└── scripts/
    ├── verify.py             ladder resolution, run orchestration, generated artifacts
    ├── evidence_check.py     validates that a ticked checkbox is supported by run.json
    └── runner/run.py         the only file with a dependency: Playwright, driven by verify.py

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

`ai-dlc-verify` is a **companion package to core, not a profile**: it is stack-agnostic, it
installs globally like core, and it is the only thing in the repo that opens a browser. It
supplies the verification half of G4 — the same Demo script core already requires, driven in a
browser and screenshotted — and everything project-specific about it lives in the `verify:`
block of the *target* repo's `.ai/aidlc.yaml`, never here. It hooks into core through exactly
one seam: `check_g4` in `aidlc.py` counts unticked `- [ ]` boxes across the whole of `uow.md`,
so a "Verification evidence" section appended to a UoW becomes a real gate precondition. That
seam is also the reason the section must only be written when `verify.py --doctor` reports
`capable` — see "The verification ladder" below.

There is no build step or test suite anywhere in this repo, and every script is
**stdlib-only Python 3** except `ai-dlc-verify/scripts/runner/run.py`, which imports Playwright
and is needed only when a project actually runs a verification. `ai-dlc-core` and
`ai-dlc-verify` are meant to be copied (or symlinked) into `~/.claude/skills/` — e.g.
`cp -r ai-dlc-core ai-dlc-verify ~/.claude/skills/` — and run against some
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

# Browser verification (ai-dlc-verify). --doctor first, always: it reports the rung and
# changes nothing. Only the `capable` rung may write checkboxes into uow.md.
python3 ai-dlc-verify/scripts/verify.py <repo>/.ai/features/<slug> --doctor
python3 ai-dlc-verify/scripts/verify.py <repo>/.ai/features/<slug> --write
python3 ai-dlc-verify/scripts/verify.py <repo>/.ai/features/<slug> --env local --viewport desktop
python3 ai-dlc-verify/scripts/verify.py <repo>/.ai/features/<slug> --manual-login --env staging
python3 ai-dlc-verify/scripts/evidence_check.py <repo>/.ai/features/<slug>
python3 ai-dlc-verify/scripts/verify.py --version    # → aidlc_verify X.Y.Z (ruleset N)

# The browser runner, once per machine (only needed on the `capable` rung). Use a venv when
# the system Python is externally managed, and point AIDLC_VERIFY_PYTHON at it.
pip install -r ai-dlc-verify/scripts/runner/requirements.txt && playwright install chromium
AIDLC_VERIFY_PYTHON=~/.venvs/aidlc-verify/bin/python python3 ai-dlc-verify/scripts/verify.py <dir> --doctor
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

### The verification ladder (`ai-dlc-verify`)

The controller pattern extends into verification, with one extra constraint: this package is
installed globally and will meet projects that have no login, no staging environment, and no
credentials on the current machine. A verification tool that fails loudly in those cases gets
disabled, and a disabled gate is worse than an absent one. So `verify.py resolve()` returns
exactly one of four states, and **only `capable` may cause a checkbox to be written**:

| Rung | Trigger | Behaviour |
|---|---|---|
| `not applicable` | no `verify:` block in `.ai/aidlc.yaml` | nothing resolved, nothing printed beyond one line, exit 0 |
| `skipped` | configured, but a required env's credentials are absent or blank | one line, no browser, no `evidence/`, exit 0 |
| `capable` | configured and credentialed | full run; evidence gates G4 |
| `config error` | a contradiction (`required: true` + `enabled: false`, unknown recipe, viewport with no width, a spec naming an undefined env) | exit 1 — **must not degrade into `skipped`**, which would silently drop a required environment |

The reason this matters when editing the scripts: the enforcement mechanism is core's
`check_g4` counting `- [ ]` boxes in `uow.md`. Writing that block on any rung but `capable`
produces checkboxes the project can never satisfy, and the only way out of that is editing
`.aidlc-state.yaml` — the one move that makes the whole apparatus theatre. `--doctor` exists to
be run *before* the UoW template is written, at G3.

Other invariants worth preserving:

- **`verify.py` does all the parsing and deciding; `runner/run.py` only drives a browser.** The
  runner receives a finished plan (resolved URLs, parsed steps, parsed assertions) and writes
  `evidence/run.json`. It decides nothing about which environments are required. Keeping the
  judgement in a stdlib-only process — the runner is invoked as a subprocess, never imported —
  is what lets a machine with no Playwright validate evidence someone else produced. That is
  also why `verify.py` must never `import playwright`.
- **The plan reaches the runner over stdin, never a file**, because it carries credentials.
  `--manual-login` is the exception — stdin has to stay free for the human's Enter — and that
  mode deliberately reads no credentials at all, so its 0600 temp file holds nothing secret.
- **Screenshots are captured on failure too.** A red step's screenshot is the defect report; a
  green-only runner would discard the most useful artifact of a bad run.
- **Warm-up is not a retry, and must never become one.** Each environment gets one request
  before the session is established whose result no verdict is derived from, so a cold load
  balancer is recorded as a duration rather than mislabelled as a flaky step. It retries only on
  transport failure or `502/503/504` — never on page content — and `warmup.attempts` is capped
  at `WARMUP_ATTEMPT_CEILING = 5`. That ceiling is the seam that keeps "the environment was not
  up" separate from "the assertion failed"; raising it would let a retry budget start absorbing
  real regressions, which is the failure mode this package exists to prevent.
- **`evidence_check.py` imports `verify.py` as a sibling** (they must stay in the same
  directory), and reaches for `ai-dlc-core/scripts/uow_graph.py` to read UoW frontmatter with
  core's own parser — trying `$AIDLC_CORE`, then `../../ai-dlc-core/scripts`, then
  `~/.claude/skills/ai-dlc-core/scripts`. Its fallback reads only `id` and `verifies`, a
  deliberately narrower contract than the full schema.
- **`08-evidence.md`, `evidence/` and `.ai/.auth/` are generated or secret.** They belong in the
  target repo's `.gitignore` alongside core's three generated files. `.ai/credentials.env` is
  *not* matched by a `.env*` pattern — check with `git check-ignore -v`.

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
