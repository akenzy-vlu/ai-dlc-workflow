# files

This repo holds two **Claude Code skill packages** — not an application. There is no build
step, package manifest, or test suite; everything is stdlib-only Python 3.

- **`ai-dlc-core/`** — a stack-agnostic feature-planning workflow. Implements AI-DLC
  (Inception → Construction → Operations): a feature moves through six gates (`G0`…`G5`),
  and `scripts/aidlc.py` refuses to advance a gate or unlock construction commands until
  machine-checkable preconditions are met. Gates are enforced by a program, not by prose.
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

## Install on a new machine

Core and a profile install to **different scopes**, deliberately:

| Package         | Install to                                                      | Why                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-dlc-core`   | `~/.claude/skills/` — **global**                                | You plan features across more than one repo; `project_registry.py` aggregates plans *across* repos, so the tooling needs to be available everywhere.                                        |
| a stack profile | `<target-repo>/.claude/skills/` — **project**, committed to git | A profile is scoped to the one repo it describes. Installing it inside the repo means it only ever loads there, and reaches teammates via `git clone` instead of a manual `cp` per machine. |

```bash
# 1. clone this repo somewhere durable
git clone <this-repo-url> ~/dev/files
AIDLC_SRC=~/dev/files

# 2. install core globally — once per machine
cp -r "$AIDLC_SRC/ai-dlc-core" ~/.claude/skills/

# 3. convenience aliases (same path on every machine)
alias aidlc='python3 ~/.claude/skills/ai-dlc-core/scripts/aidlc.py'
alias uowg='python3 ~/.claude/skills/ai-dlc-core/scripts/uow_graph.py'

# 4. verify
uowg --version          # → uow_graph X.Y.Z (ruleset N)
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
