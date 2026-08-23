# files

This repo holds three **Claude Code skill packages** — not an application. There is no build
step and no test suite; everything is stdlib-only Python 3, except the browser runner in
`ai-dlc-verify/scripts/runner/run.py`, which needs Playwright and is the only file in the
repo with a dependency outside the standard library.

- **`ai-dlc-core/`** — a stack-agnostic feature-planning workflow. Implements AI-DLC
  (Inception → Construction → Operations): a feature moves through six gates (`G0`…`G5`),
  and `scripts/aidlc.py` refuses to advance a gate or unlock construction commands until
  machine-checkable preconditions are met. Gates are enforced by a program, not by prose.
- **`ai-dlc-verify/`** — the verification half of G4, for projects with a browser UI. Drives a
  real login and walks a feature's verification steps at each declared viewport, in each
  environment, producing screenshots, an evidence report and a PR draft. Stack-agnostic:
  everything project-specific lives in the `verify:` block of the target repo's
  `.ai/aidlc.yaml`. It resolves at runtime to one of three rungs and only the third can block
  a gate, so installing it globally is safe on projects that have no login, no staging
  environment, or no credentials on this machine.
- **`examples/profile-flutter/`** — an *example* stack profile (for a fictional/sample
  Flutter monorepo), showing the shape a real profile must take per
  `ai-dlc-core/references/profile-contract.md`. A profile supplies repo-specific
  conventions, a concrete definition-of-done, and its own discovery script; it depends on
  `ai-dlc-core` for the workflow itself.

Read `PILOT-RUNBOOK.md` first — it's an end-to-end dry run of both packages against a real
repo, with expected output at every step.

## Repository layout

```
ai-dlc-core/                  stack-agnostic feature-planning workflow
├── SKILL.md
├── references/
│   ├── methodology.md        what each phase does, why each gate exists
│   ├── templates.md          artifact/frontmatter shapes — source of truth for schema
│   ├── discovery-protocol.md discoverable-vs-undiscoverable framing for Phase 0
│   ├── sync.md               how a target repo's .ai/ reaches a central report
│   └── profile-contract.md   the interface a stack profile must implement
└── scripts/
    ├── aidlc.py               controller: gate state, ticket review, snapshot
    ├── uow_graph.py           graph validator/generator, write-conflict hazards, ruleset pin
    ├── project_registry.py    cross-repo read model: --scan / --ingest / --report
    └── discover_generic.py    read-only repo inventory, any stack

ai-dlc-verify/                browser verification for G4 — screenshots as evidence
├── SKILL.md
├── references/
│   ├── verification-protocol.md  the three rungs; discoverable vs undiscoverable; pass rules
│   ├── config-schema.md      every key of the `verify:` block, and the credentials file
│   ├── login-recipes.md      none / form / clerk-hosted / storage-state
│   └── templates.md          07-verification.md, the uow.md block, 08-evidence.md, PR draft
└── scripts/
    ├── verify.py             the ladder, the run, the generated artifacts (stdlib)
    ├── evidence_check.py     turns a ticked checkbox back into a checkable claim (stdlib)
    └── runner/run.py         the only file with a dependency: Playwright, driven by verify.py

examples/profile-flutter/     EXAMPLE stack profile — reference impl of the contract above,
├── SKILL.md                  for one specific (fictional/sample) Flutter monorepo,
├── references/               not a profile shipped for real use
│   └── flutter-rules.md      layer boundaries, BLoC shape, reuse inventory, concrete DoD
└── scripts/
    └── discover_repo.py      Flutter-specific inventory (utse_ui_kit, segmentOf() routes, ...)

PILOT-RUNBOOK.md              end-to-end dry run of both packages against a real repo
CLAUDE.md                     guidance for Claude Code when working in this repo
```

## Requirements

- Python 3 (stdlib only — no pip install, no virtualenv)
- Claude Code (this is a skill package meant to be loaded into `~/.claude/skills/`)
- A separate *target* repo to plan features in — this repo is the tooling, not the project
  you'll run it against
- Playwright **only** if you use `ai-dlc-verify` against a project that actually runs it
  (`pip install -r ai-dlc-verify/scripts/runner/requirements.txt && playwright install chromium`).
  Everything else — resolving the ladder, reading `run.json`, generating the report, validating
  evidence somebody else produced — works without it.

## Install on a new machine

Core and a profile install to **different scopes**, deliberately:

| Package         | Install to                                                      | Why                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-dlc-core`   | `~/.claude/skills/` — **global**                                | You plan features across more than one repo; `project_registry.py` aggregates plans *across* repos, so the tooling needs to be available everywhere.                                        |
| `ai-dlc-verify` | `~/.claude/skills/` — **global**                                | Same reason, and it is designed for it: on a project with no `verify:` block, no credentials, or no browser at all it resolves to a rung that does nothing and blocks nothing.              |
| a stack profile | `<target-repo>/.claude/skills/` — **project**, committed to git | A profile is scoped to the one repo it describes. Installing it inside the repo means it only ever loads there, and reaches teammates via `git clone` instead of a manual `cp` per machine. |

```bash
# 1. clone this repo somewhere durable
git clone <this-repo-url> ~/dev/files
AIDLC_SRC=~/dev/files

# 2. install core and verify globally — once per machine
cp -r "$AIDLC_SRC/ai-dlc-core" "$AIDLC_SRC/ai-dlc-verify" ~/.claude/skills/

# 3. the browser runner, once per machine and only if you will use it.
#    A venv keeps Playwright out of an externally-managed system Python.
python3 -m venv ~/.venvs/aidlc-verify
~/.venvs/aidlc-verify/bin/pip install -r ~/.claude/skills/ai-dlc-verify/scripts/runner/requirements.txt
~/.venvs/aidlc-verify/bin/playwright install chromium
export AIDLC_VERIFY_PYTHON=~/.venvs/aidlc-verify/bin/python   # put this in your shell profile

# 4. convenience aliases (same path on every machine)
alias aidlc='python3 ~/.claude/skills/ai-dlc-core/scripts/aidlc.py'
alias uowg='python3 ~/.claude/skills/ai-dlc-core/scripts/uow_graph.py'
alias aidlc-verify='python3 ~/.claude/skills/ai-dlc-verify/scripts/verify.py'
alias aidlc-evidence='python3 ~/.claude/skills/ai-dlc-verify/scripts/evidence_check.py'

# 5. verify
uowg --version          # → uow_graph X.Y.Z (ruleset N)
aidlc-verify --version  # → aidlc_verify X.Y.Z (ruleset N)   — the two rulesets must match
```

If you're planning against a repo that matches an existing profile (e.g. a Flutter monorepo
shaped like the example), copy that profile into the *target* repo instead of globally:

```bash
cd <path-to-target-repo>
mkdir -p .claude/skills
cp -r "$AIDLC_SRC/examples/profile-flutter" .claude/skills/profile-flutter
```

Then, in the target repo, initialize its `.ai/` directory (see `PILOT-RUNBOOK.md` Part 1 for
the full `.ai/aidlc.yaml` contents and next steps):

```bash
mkdir -p .ai
```

Running without a profile still works — you lose the stack-specific definition-of-done and a
richer discovery map, but gates, decomposition, the graph, and sync all work unchanged via
`ai-dlc-core/scripts/discover_generic.py`.

## Sanity-check a script after editing it

There's no test suite; validate with:

```bash
python3 -m py_compile ai-dlc-core/scripts/aidlc.py
```

and by running the command end-to-end against a scratch `.ai/features/<slug>` directory, as
walked through in `PILOT-RUNBOOK.md`.

## Learn more

- `CLAUDE.md` — architecture notes, the controller pattern, versioning discipline
  (`RULESET`), and reading order for `ai-dlc-core/references/*.md`
- `PILOT-RUNBOOK.md` — the full walkthrough, including a real bug it caught during dry-run
