# ai-dlc

One workspace for the AI-DLC method: the **Claude Code skill packages** that enforce it, and
the **console** that gives you a portfolio view across every repository using them.

Everything under `skills/` is stdlib-only Python 3 with no build step — the single exception
is the browser runner in `skills/ai-dlc-verify/scripts/runner/run.py`, which needs Playwright.
Everything under `apps/` is the built and tested half: a pnpm workspace holding the console.

- **`skills/ai-dlc-core/`** — a stack-agnostic feature-planning workflow. Implements AI-DLC
  (Inception → Construction → Operations): a feature moves through six gates (`G0`…`G5`),
  and `scripts/aidlc.py` refuses to advance a gate or unlock construction commands until
  machine-checkable preconditions are met. Gates are enforced by a program, not by prose.
- **`skills/ai-dlc-verify/`** — the verification half of G4, for projects with a browser UI. Drives a
  real login and walks a feature's verification steps at each declared viewport, in each
  environment, producing screenshots, an evidence report and a PR draft. Stack-agnostic:
  everything project-specific lives in the `verify:` block of the target repo's
  `.ai/aidlc.yaml` — which is why it installs **into that repo**, next to the config it
  reads. It resolves at runtime to one of three rungs and only the third can block a gate, so
  a repo with no login, no staging environment, or no credentials on this machine is not
  blocked by having it installed.
- **`plugin/ai-dlc/`** — a Claude Code **plugin**: the agent-facing half. Five gate-aware
  subagents, each defined as much by the one move it refuses as by what it does — an
  implementer that never accepts its own work, an explorer that never signs its own discovery
  draft, a reviewer that only ever rejects — plus two PreToolUse hooks that turn rules stated
  in prose into refusals: no destructive commands, no hand-edits of the controller's state or
  its generated files, no credentials in the transcript, the repo or a push. Installed with
  `/plugin`, not by copying. It is the only thing outside `apps/` with a test suite
  (`pnpm hooks:test`), because a hook that denies can stop legitimate work.
- **`apps/`** — the **AI-DLC Console**: a NestJS 11 API (`apps/api/`) and a React 19 + Ant
  Design 6 client (`apps/web/`), in a pnpm workspace. A portfolio view and control plane over
  every repository that has an `.ai/` plan — where each feature stands, what is waiting on a
  person right now, and what can actually be picked up today. It never writes plan state
  itself: every mutation is a subprocess call to the controller above, and the controller's
  answer — including its refusals — is shown verbatim. See `docs/console.md`.
- **`examples/profile-flutter/`** — an *example* stack profile (for a fictional/sample
  Flutter monorepo), showing the shape a real profile must take per
  `skills/ai-dlc-core/references/profile-contract.md`. A profile supplies repo-specific
  conventions, a concrete definition-of-done, and its own discovery script; it depends on
  `ai-dlc-core` for the workflow itself.

Read `docs/PILOT-RUNBOOK.md` first — it's an end-to-end dry run of both packages against a real
repo, with expected output at every step.

## Repository layout

```
skills/                       the two installable Claude Code skill packages
├── ai-dlc-core/              stack-agnostic feature-planning workflow
│   ├── SKILL.md
│   ├── references/
│   │   ├── methodology.md        what each phase does, why each gate exists
│   │   ├── templates.md          artifact/frontmatter shapes — source of truth for schema
│   │   ├── discovery-protocol.md discoverable-vs-undiscoverable framing for Phase 0
│   │   ├── sync.md               how a target repo's .ai/ reaches a central report
│   │   └── profile-contract.md   the interface a stack profile must implement
│   └── scripts/
│       ├── aidlc.py              controller: gate state, ticket review, snapshot
│       ├── uow_graph.py          graph validator/generator, write-conflict hazards, ruleset pin
│       ├── project_registry.py   cross-repo read model: --scan / --ingest / --report
│       └── discover_generic.py   read-only repo inventory, any stack
└── ai-dlc-verify/            browser verification for G4 — screenshots as evidence
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

plugin/ai-dlc/                Claude Code plugin — the agents that work inside the gates,
├── .claude-plugin/           and the hooks that stop an agent stepping around them
│   └── plugin.json
├── agents/                   aidlc-explorer, -implementer, -tester, -test-runner,
│                             -security-reviewer
├── hooks/
│   ├── hooks.json            PreToolUse wiring: Bash, Write|Edit|MultiEdit, Read
│   ├── rules.py              shared — wire protocol, shell parsing, wrapper stripping
│   ├── block_dangerous.py    destructive commands + controller-integrity refusals
│   ├── no_secrets.py         credentials in commands, content, reads and git
│   └── test_hooks.py         the only test suite outside apps/ — `pnpm hooks:test`
└── README.md                 the rule tables and the `.claude/aidlc-hooks.json` escape hatch

apps/                         the AI-DLC Console — the only built and tested code in the repo
├── api/                      NestJS 11, Clean Architecture + DDD; shells out to the controller
│   └── Dockerfile            above and shows its verdict verbatim. Seven bounded contexts.
└── web/                      React 19 + Ant Design 6, feature-sliced
    ├── Dockerfile            two targets: `runtime` (nginx + built SPA), `dev` (vite + HMR)
    └── nginx.conf            serves the SPA, proxies /api and the /events socket

examples/profile-flutter/     EXAMPLE stack profile — reference impl of the contract above,
├── SKILL.md                  for one specific (fictional/sample) Flutter monorepo,
├── references/               not a profile shipped for real use
│   └── flutter-rules.md      layer boundaries, BLoC shape, reuse inventory, concrete DoD
└── scripts/
    └── discover_repo.py      Flutter-specific inventory (sample_ui_kit, segmentOf() routes, ...)

docs/
├── PILOT-RUNBOOK.md          end-to-end dry run of both skills against a real repo
└── console.md                the console's design, its two integrations, getting started

.claude-plugin/marketplace.json   makes this repo installable: `/plugin marketplace add <path>`
CLAUDE.md                     guidance for Claude Code when working in this repo
package.json                  pnpm workspace root — scripts spanning apps/ and skills/
pnpm-workspace.yaml           declares apps/api and apps/web
docker-compose.yml            api + web; `prod` and `dev` profiles pick the web service
.env.example                  compose config — AIDLC_WORKSPACE is the one required value
```

## Requirements

- Python 3 (stdlib only — no pip install, no virtualenv) for everything under `skills/`
- Claude Code (the packages under `skills/` are meant to be loaded into `~/.claude/skills/`)
- Node 22+ and pnpm 10+ **only** if you run the console under `apps/` — the skills work
  without either
- [`rtk`](https://github.com/rtk-ai/rtk) — **optional**. A token-filtering CLI proxy the
  skills and agents prefer for reading a repo; without it on `PATH` they run the native
  command and behave identically. See "Optional: `rtk`" below for the one thing it must
  never be pointed at
- A separate *target* repo to plan features in — this repo is the tooling, not the project
  you'll run it against
- Playwright **only** if you use `ai-dlc-verify` against a project that actually runs it
  (`pip install -r skills/ai-dlc-verify/scripts/runner/requirements.txt && playwright install chromium`).
  Everything else — resolving the ladder, reading `run.json`, generating the report, validating
  evidence somebody else produced — works without it.

## Scope: where each package installs

Every package declares its own `scope:` in its `SKILL.md`, and that is what decides where it
may be installed — it is a property of the skill, not a choice made at install time:

| Package                    | `scope:`  | Installs to                                        | Why                                                                                                                                                                                    |
| -------------------------- | --------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-dlc-core`              | `global`  | `~/.claude/skills/`                                | You plan features across more than one repo, and `project_registry.py` aggregates plans *across* repos — so the tooling has to be reachable from all of them.                          |
| `ai-dlc-verify`            | `project` | `<repo>/.claude/skills/`, committed to git         | Everything it reads is in the repo: the `verify:` block, the environments, the credentials file, the evidence it writes back. Installing it beside that config versions the two together. |
| `examples/profile-flutter` | `project` | `<repo>/.claude/skills/`, committed to git         | A profile describes one repo. Installed globally it would load — and compete to be selected — in every other project on the machine.                                                    |

Both project-scoped packages reach teammates through `git clone` rather than a manual `cp` on
every machine, which is the practical half of why they live in the repo.

A package that declares no scope is read as `project`, the conservative default: the cost of
a too-narrow scope is one extra install, while a wrong `global` puts a skill into every
repository on the machine.

The console's **Skills** page reads these packages straight off disk, shows each one's scope
as a tag, and offers the matching action — one machine-wide *sync* for a global skill, one
*install* per tracked repository for a project skill. It compares by content digest, so a
package edited in this checkout shows as `differs` at any target still holding the old bytes.

## Install on a new machine

Scopes are in the table above. Once per machine:

```bash
# 1. clone this repo somewhere durable
git clone <this-repo-url> ~/dev/ai-dlc
AIDLC_SRC=~/dev/ai-dlc

# 2. install core globally — once per machine. ai-dlc-verify is NOT installed here;
#    it goes into each target repo — see "Per-repo install" below.
cp -r "$AIDLC_SRC/skills/ai-dlc-core" ~/.claude/skills/

# 3. the browser runner, once per machine and only if you will use it. Read from the
#    checkout, since verify itself is no longer at a fixed global path.
#    A venv keeps Playwright out of an externally-managed system Python.
python3 -m venv ~/.venvs/aidlc-verify
~/.venvs/aidlc-verify/bin/pip install -r "$AIDLC_SRC/skills/ai-dlc-verify/scripts/runner/requirements.txt"
~/.venvs/aidlc-verify/bin/playwright install chromium
export AIDLC_VERIFY_PYTHON=~/.venvs/aidlc-verify/bin/python   # put this in your shell profile

# 4. convenience aliases. The core ones point at the global install; the verify ones point
#    at the checkout, which is the one copy that is always current — a per-repo install is
#    a snapshot of it, and there is no single path that names all of them.
alias aidlc='python3 ~/.claude/skills/ai-dlc-core/scripts/aidlc.py'
alias uowg='python3 ~/.claude/skills/ai-dlc-core/scripts/uow_graph.py'
alias aidlc-verify='python3 ~/dev/ai-dlc/skills/ai-dlc-verify/scripts/verify.py'
alias aidlc-evidence='python3 ~/dev/ai-dlc/skills/ai-dlc-verify/scripts/evidence_check.py'

# 5. verify
uowg --version          # → uow_graph X.Y.Z (ruleset N)
aidlc-verify --version  # → aidlc_verify X.Y.Z (ruleset N)   — the two rulesets must match
```

The plugin is **installed, not copied** — the repo root carries the marketplace manifest, so
Claude Code tracks its version and can update it in place:

```bash
claude plugin marketplace add "$AIDLC_SRC"    # or, in a session: /plugin marketplace add <path>
claude plugin install ai-dlc@ai-dlc
claude plugin details ai-dlc@ai-dlc           # 5 agents, 1 PreToolUse hook (2 scripts)
```

After changing anything under `plugin/`, bump `version` in
`plugin/ai-dlc/.claude-plugin/plugin.json` and re-run `claude plugin update ai-dlc@ai-dlc`:
the installed copy lives in `~/.claude/plugins/cache/`, so an un-bumped edit in this checkout
is not what the hooks actually run.

### Per-repo install

`ai-dlc-verify`, and a stack profile if one fits, go inside each repo you plan features in —
committed, so teammates get them from `git clone` rather than a manual `cp` per machine:

```bash
cd <path-to-target-repo>
mkdir -p .claude/skills

# the verification half of G4 — needed only in repos with a browser UI to verify
cp -r "$AIDLC_SRC/skills/ai-dlc-verify" .claude/skills/ai-dlc-verify

# and a profile, if this repo matches one (e.g. a Flutter monorepo shaped like the example)
cp -r "$AIDLC_SRC/examples/profile-flutter" .claude/skills/profile-flutter
```

The console's **Skills** page is the same operation with a button, and it will tell you which
repos are missing a copy and which hold a stale one.

Then, in the target repo, initialize its `.ai/` directory (see `docs/PILOT-RUNBOOK.md` Part 1 for
the full `.ai/aidlc.yaml` contents and next steps):

```bash
mkdir -p .ai
```

Running without a profile still works — you lose the stack-specific definition-of-done and a
richer discovery map, but gates, decomposition, the graph, and sync all work unchanged via
`skills/ai-dlc-core/scripts/discover_generic.py`.

## Optional: `rtk`

[`rtk`](https://github.com/rtk-ai/rtk) is a token-filtering CLI proxy — `rtk tree`, `rtk grep`,
`rtk read`, `rtk git`, `rtk test` return the same information in a fraction of the context,
which is most of what discovery and ticket exploration spend. Every `SKILL.md` and agent file
in this repo prefers it and every one of them marks it optional: nothing here depends on it,
no script shells out to it, and without it on `PATH` the native command runs instead.

One rule matters more than the saving. **Never read a verdict through a filter** — `aidlc
check`, `aidlc status`, `uowg`, `verify.py --doctor` and `evidence_check.py` print *why*
something was refused, and that reason is the thing you act on. A condensed "G3 failed" that
drops which acceptance criterion is uncovered turns a machine-checkable precondition back into
the prose this project exists to replace.

A second caveat is about absence. rtk's readers apply their own ignore rules, so a filtered
search is a fast *index*, not an exhaustive one — `rtk find . -name '__pycache__' -type d`
reports `0 matches` in this repo where native `find` lists three. When "there are none" is the
answer you are about to act on, confirm it natively.

The plugin handles rtk for you rather than trusting that rule. rtk ships a hook that *rewrites*
commands, so `git push` silently becomes `rtk git push`; since every hook rule dispatches on
the program a command invokes, an unstripped prefix would disable the guard for exactly the
commands it exists to catch. `rules.head_of` strips `rtk` the way it strips `sudo`, and
`rtk proxy rm -rf /`, `rtk run -c 'rm -rf /'` and `rtk read .env` are each refused as the
command underneath. `plugin/ai-dlc/README.md` has the table.

## Running the console

The console is a normal pnpm workspace at the repo root. `docs/console.md` is the full guide;
the short version:

```bash
pnpm install
cd apps/api && cp .env.example .env   # only if your skills live somewhere unusual
cd ../.. && pnpm dev                  # API on :7777, client on :5173
```

By default the API looks for the skills at `~/.claude/skills/ai-dlc-core`, i.e. the *installed*
copies — not the ones in this repo. Point `AIDLC_CORE_PATH` at `<this-repo>/skills/ai-dlc-core`
if you want the console to drive your working copy instead of the installed one.

`AIDLC_VERIFY_PATH` needs setting explicitly now that verify is project-scoped: its default is
core's sibling, `~/.claude/skills/ai-dlc-verify`, which nothing installs any more. Point it at
`<this-repo>/skills/ai-dlc-verify` — the console runs one copy of `verify.py` against whichever
repo you are looking at, so the checkout is the right one to use, and it is always current.
Leave it wrong and the verification panel reports "not installed" on a machine that has it.

## Running the console in Docker

```bash
cp .env.example .env          # then set AIDLC_WORKSPACE to the directory holding your repos
docker compose up -d --build  # → http://localhost:8080
```

For the vite dev server with hot reload instead of the built SPA:

```bash
docker compose --profile dev up   # → http://localhost:5173
```

Both modes run the same API container; only the web service differs. In production shape
nginx serves the built SPA and reverse-proxies `/api` and the `/events` socket to the API, so
the browser stays same-origin and CORS never enters the picture — the same arrangement the
vite dev-server proxy makes in development.

The container stack is five services: the API and the web client, plus **Postgres**,
**Redis** and **MinIO** holding the console's own state.

| State | File driver (`pnpm dev`) | Postgres driver (Docker) |
| ----- | ------------------------ | ------------------------ |
| tracked repositories, settings, agent definitions, run transcripts | `~/.aidlc-console/*.json` | Postgres |
| evidence screenshots | `~/.aidlc-console/evidence-cas/` | MinIO, still content-addressed |
| parsed-plan cache | in-process, 30s TTL | in-process, invalidations fanned out over Redis |
| **plan data** | `.ai/` in each repo | `.ai/` in each repo — unchanged |

`AIDLC_STORE` picks the set: unset (or `file`) keeps everything on disk so `pnpm dev` needs
no infrastructure at all; `postgres` is what compose sets. Plan data is in neither, and that
is deliberate — `.ai/` on disk is the source of truth, the controller is a subprocess that
reads and writes those files, and a second copy in a database would start drifting the
moment a gate was passed outside the console.

Which is why the repository bind mount stays even with the databases running: it is not
console state, it is the plan data the controller needs to reach.

### Three ways to run it

The API and the services are separable, and which combination you want depends on whether
you need to launch agent CLIs:

```bash
docker compose up -d          # everything in containers  → http://localhost:8080
pnpm services && pnpm dev:hybrid   # services in containers, API on this machine → :5173
pnpm dev                      # everything on this machine, no infrastructure at all
```

**`dev:hybrid` is the one to reach for if you launch agents.** Postgres, Redis and MinIO stay
in containers and keep your data, but the API runs on your machine — so `claude` is on `PATH`,
it uses your credentials, and the agent works in your real toolchain. That last part is not a
nicety: a repo's `node_modules` holds binaries built for *this* machine, so an agent running
inside the Linux image cannot execute a definition-of-done that runs your test suite.

The services publish on loopback at deliberately unusual host ports (`55432`, `56379`,
`59000`) so this stack never fights another project's Postgres for `5432`.

Three things about the container worth knowing before you rely on it:

- **The API image bakes in `skills/` from this repo** at `/opt/aidlc/skills`. That is the
  opposite of the native default, which uses the *installed* copies under
  `~/.claude/skills/`. So Docker always drives this working tree's controller — and a change
  to `skills/` needs `docker compose build api` before the console sees it.
- **`AIDLC_WORKSPACE` is bind-mounted at the same absolute path inside the container.** The
  tracked-repository registry stores absolute host paths, so this is what makes a repo added
  during a native run resolve unchanged in the container. Mount it anywhere else and every
  tracked repo reads as missing.
- **Agent launching does not work in the container.** The launcher resolves `claude`, `codex`,
  `cursor-agent` and `copilot` off `PATH`; none are in the image, and they would need your
  host credentials besides. The agents panel degrades honestly — every entry shows as
  unavailable rather than failing — but if you launch agents from the console, run it
  natively. `ai-dlc-verify` is in the same position: the image has no Playwright, so
  verification resolves to a rung that reports rather than drives a browser.

## Sanity-check after editing

The packages under `skills/` have no test suite; validate a script with:

```bash
python3 -m py_compile skills/ai-dlc-core/scripts/aidlc.py   # or: pnpm skills:check
```

and by running the command end-to-end against a scratch `.ai/features/<slug>` directory, as
walked through in `docs/PILOT-RUNBOOK.md`.

The plugin *does* have a test suite, and it is the one to run after touching a hook — the
tests drive the hooks as subprocesses over stdin, because the JSON wire protocol is the
contract:

```bash
pnpm hooks:test   # 54 cases, run from the repo root
```

Every rule needs a case both ways: that it catches what it exists to catch, and that it stays
quiet on the neighbouring command that is fine. The second half is what decides whether anyone
keeps the plugin enabled.

The console has tests too, and they are the fast check that a change did not break the read
model:

```bash
pnpm test         # apps/api domain tests — no I/O, no subprocesses
pnpm typecheck    # both apps
```

## Learn more

- `CLAUDE.md` — architecture notes, the controller pattern, versioning discipline
  (`RULESET`), and reading order for `skills/ai-dlc-core/references/*.md`
- `docs/PILOT-RUNBOOK.md` — the full walkthrough, including a real bug it caught during dry-run
- `plugin/ai-dlc/README.md` — every hook rule, what each one refuses and why, how wrapped
  commands are resolved, and the `.claude/aidlc-hooks.json` escape hatch for a false positive
- `docs/console.md` — the console's design: why it never writes plan state, how it groups
  repositories into projects, and the two integrations worth their own paragraph
