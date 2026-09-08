# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This repo is one workspace holding three halves that ship separately:

- **`skills/`** — three Claude Code skill packages (two shipped, one example). Stdlib-only
  Python 3, no build, no test suite. These get copied into `~/.claude/skills/` and run against
  *other* repositories.
- **`plugin/ai-dlc/`** — a Claude Code **plugin**: the five AI-DLC subagents and the two
  PreToolUse hooks. Stdlib-only Python 3 like the skills, but unlike them it *does* have a test
  suite (`pnpm hooks:test`), because a hook that denies can stop legitimate work. Installed via
  `/plugin`, not by copying.
- **`apps/`** — the AI-DLC Console, a pnpm workspace (NestJS 11 + React 19). The only built and
  tested code here. It is a **client** of the skills above: it never writes plan state itself,
  it shells out to `aidlc.py` / `uow_graph.py` and shows the verdict verbatim.

Treat them as separate change surfaces. A `RULESET` bump under `skills/` is a breaking change
the console must be checked against; a console change never alters gate semantics; and a hook
under `plugin/` can refuse a tool call the other two would have allowed, which is the point.

```
skills/ai-dlc-core/           stack-agnostic feature-planning workflow
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

skills/ai-dlc-verify/        browser verification for G4 — the same demo script, screenshotted
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

apps/api/                    NestJS 11 — Clean Architecture + DDD, seven bounded contexts
├── src/contexts/            portfolio, planning, construction, governance, verification,
│                              agents, and an insight read model composing them
├── src/config/aidlc.config.ts  where the controller scripts are found (AIDLC_CORE_PATH)
└── test/                    vitest — domain tests, no I/O and no subprocesses

apps/api/src/contexts/skills/  skill packaging: what this checkout ships and where it is
                             installed. Reads SKILL.md `scope:`, digests packages, copies
                             them to ~/.claude/skills (global) or <repo>/.claude/skills
                             (project). The only context that writes outside .ai/ state.

apps/web/                    React 19 + Ant Design 6, feature-sliced, Redux Toolkit
├── Dockerfile               targets: `runtime` (nginx + built SPA) and `dev` (vite + HMR)
└── nginx.conf               one origin for SPA + /api + /events; mirrors the vite proxy

examples/profile-flutter/    EXAMPLE stack profile — reference impl of the contract below,
├── SKILL.md                       for one specific (fictional/sample) Flutter monorepo,
├── references/                    not a profile shipped for real use
│   └── flutter-rules.md      layer boundaries, BLoC shape, reuse inventory, concrete DoD
└── scripts/
    └── discover_repo.py      profile-specific inventory (sample_ui_kit, segmentOf() routes, ...)

plugin/ai-dlc/               Claude Code plugin — the agents that work inside the gates and
├── .claude-plugin/               the hooks that stop an agent stepping around them
│   └── plugin.json
├── agents/                  aidlc-explorer, -implementer, -tester, -test-runner,
│                              -security-reviewer. Each is defined as much by what it
│                              refuses (explorer never signs `verified_by`, reviewer never
│                              accepts, test-runner writes nothing) as by what it does.
├── hooks/
│   ├── hooks.json           PreToolUse wiring: Bash, Write|Edit|MultiEdit, Read
│   ├── rules.py             shared — wire protocol, shell parsing, allowlist config
│   ├── block_dangerous.py   destructive commands + controller-integrity refusals
│   ├── no_secrets.py        credentials in commands, content, reads and git
│   └── test_hooks.py        the only test suite outside apps/ — `pnpm hooks:test`
└── README.md                the rule tables and the `.claude/aidlc-hooks.json` escape hatch

.claude-plugin/marketplace.json   makes this repo installable: `/plugin marketplace add <path>`

docs/PILOT-RUNBOOK.md        end-to-end dry run of both skills against a real repo — read first
docs/console.md              the console's design, its integrations, and getting started
package.json                 pnpm workspace root: dev / build / typecheck / test / skills:check
                               / hooks:test
docker-compose.yml           api + web, with `prod` and `dev` profiles selecting the web
.env.example                 compose config; AIDLC_WORKSPACE is the one required value
```
skills/ai-dlc-core/                  stack-agnostic feature-planning workflow
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

skills/ai-dlc-verify/               browser verification for G4 — the same demo script, screenshotted
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
    └── discover_repo.py      profile-specific inventory (sample_ui_kit, segmentOf() routes, ...)

PILOT-RUNBOOK.md              end-to-end dry run of both packages against a real repo — read first
README.md                     one-line pointer from flutter-rules.md to the profile contract
```

`ai-dlc-core` implements **AI-DLC** (Inception → Construction → Operations): a feature moves
through six gates (`G0`…`G5`), and `scripts/aidlc.py` refuses to advance a gate or unlock
construction commands until machine-checkable preconditions are met.

`examples/profile-flutter` is an **example stack profile** — it lives under `examples/`
because it demonstrates the shape a profile must take (per
`skills/ai-dlc-core/references/profile-contract.md`), not because it's a profile actively deployed
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

Nothing under `skills/` has a build step or a test suite, and every script there is
**stdlib-only Python 3** except `skills/ai-dlc-verify/scripts/runner/run.py`, which imports Playwright
and is needed only when a project actually runs a verification. (The build and the tests in
this repo all belong to `apps/`.) Each package declares its
install scope in its own `SKILL.md` frontmatter, and the two differ: `ai-dlc-core` is
`scope: global` and is copied (or symlinked) into `~/.claude/skills/`, while `ai-dlc-verify`
is `scope: project` and goes into each target repo's `.claude/skills/`, beside the `verify:`
block and credentials it reads. A real profile, modeled on `examples/profile-flutter`, is
`scope: project` too and installs the same way as verify.

```bash
cp -r skills/ai-dlc-core ~/.claude/skills/                              # global, once
cp -r skills/ai-dlc-verify <repo>/.claude/skills/                       # per repo, committed
```

Either way they run against some *other* repository's `.ai/` directory (see
`docs/PILOT-RUNBOOK.md`, Part 1). When
you're asked to modify the `ai-dlc-core` scripts, you're changing tooling that other repos'
planning sessions depend on — treat `RULESET` bumps and frontmatter-schema changes as breaking
changes (see below).

## Commands

The two halves have completely different toolchains. Paths below are relative to the repo root.

**Working tree, not the aliases.** The `aidlc` / `uowg` / `aidlc-discover` / `aidlc-registry` /
`aidlc-verify` / `aidlc-evidence` aliases resolve to the *installed* copies under
`~/.claude/skills/`, which is what a target repo's planning session should use. Developing the
skills is the one case that wants the opposite: run `python3 skills/…/scripts/*.py` from this
working tree, or you will be exercising the last-installed version and your edit will appear to
do nothing. Same trap as `AIDLC_CORE_PATH` for the console, below.

### The skills (`skills/`)

No package manager, no build, no test runner. Everything is invoked directly:

```bash
# Syntax-check a script after editing it (there is no test suite)
python3 -m py_compile skills/ai-dlc-core/scripts/aidlc.py

# Run the gate controller against a feature directory (in some *other* repo)
python3 skills/ai-dlc-core/scripts/aidlc.py -d <repo>/.ai/features/<slug> status
python3 skills/ai-dlc-core/scripts/aidlc.py -d <repo>/.ai/features/<slug> check G1
python3 skills/ai-dlc-core/scripts/aidlc.py -d <repo>/.ai/features/<slug> pass G1 --by <name>

# Validate/generate the ticket graph directly
python3 skills/ai-dlc-core/scripts/uow_graph.py <repo>/.ai/features/<slug> --write
python3 skills/ai-dlc-core/scripts/uow_graph.py <repo>/.ai/features/<slug> --parallel   # write-conflict hazards
python3 skills/ai-dlc-core/scripts/uow_graph.py --version                              # → uow_graph X.Y.Z (ruleset N)

# Inventory a repo with no stack profile yet
python3 skills/ai-dlc-core/scripts/discover_generic.py <repo-root> -o <repo>/.ai/architecture.md

# Inventory the sample Flutter monorepo specifically (richer: sample_ui_kit, segmentOf() routes) —
# example only; a real repo would use its own profile's discover_repo.py the same way
python3 examples/profile-flutter/scripts/discover_repo.py <repo-root> -o <repo>/.ai/architecture.md

# Build/query the cross-repo read model
python3 skills/ai-dlc-core/scripts/project_registry.py --db plans.db --scan <repo-root>:<label>
python3 skills/ai-dlc-core/scripts/project_registry.py --db plans.db --report

# Browser verification (ai-dlc-verify). --doctor first, always: it reports the rung and
# changes nothing. Only the `capable` rung may write checkboxes into uow.md.
python3 skills/ai-dlc-verify/scripts/verify.py <repo>/.ai/features/<slug> --doctor
python3 skills/ai-dlc-verify/scripts/verify.py <repo>/.ai/features/<slug> --write
python3 skills/ai-dlc-verify/scripts/verify.py <repo>/.ai/features/<slug> --env local --viewport desktop
python3 skills/ai-dlc-verify/scripts/verify.py <repo>/.ai/features/<slug> --manual-login --env staging
python3 skills/ai-dlc-verify/scripts/evidence_check.py <repo>/.ai/features/<slug>
python3 skills/ai-dlc-verify/scripts/verify.py --version    # → aidlc_verify X.Y.Z (ruleset N)

# The browser runner, once per machine (only needed on the `capable` rung). Use a venv when
# the system Python is externally managed, and point AIDLC_VERIFY_PYTHON at it.
pip install -r skills/ai-dlc-verify/scripts/runner/requirements.txt && playwright install chromium
AIDLC_VERIFY_PYTHON=~/.venvs/aidlc-verify/bin/python python3 skills/ai-dlc-verify/scripts/verify.py <dir> --doctor
```

The skills have no automated test suite. Validate changes
to a script by running it end-to-end against a scratch `.ai/features/<slug>` directory (see
`docs/PILOT-RUNBOOK.md` for the exact walkthrough that was used to dry-run this system, including
a real bug it caught) and by running `python3 -m py_compile` on anything you touch.

### The plugin (`plugin/ai-dlc/`)

Stdlib-only Python 3, no build — but this is the one thing outside `apps/` with a test suite,
because a hook that denies can stop legitimate work:

```bash
pnpm hooks:test          # 39 cases, run from the repo root
python3 -m unittest discover -s plugin/ai-dlc/hooks -p 'test_*.py' -v    # the same, verbose

# Drive a hook by hand, exactly as the harness does — JSON on stdin, decision on stdout
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"'$PWD'",
       "tool_input":{"command":"rm -rf /"}}' | python3 plugin/ai-dlc/hooks/block_dangerous.py

# Install it (the repo root carries the marketplace manifest)
/plugin marketplace add <this-repo>
/plugin install ai-dlc@ai-dlc
```

The tests run the hooks as subprocesses over stdin rather than importing `main()`: the wire
protocol *is* the contract, so a change to the JSON shape has to fail the suite. Every rule
needs a case both ways — that it catches what it exists to catch, and that it stays quiet on
the neighbouring command that is fine. The second half is what decides whether anyone keeps
the plugin enabled.

### The console (`apps/`)

A pnpm workspace rooted at the repo root. Run these from the root, not from inside `apps/`:

```bash
pnpm install                 # pnpm 10+, Node 22+
pnpm dev                     # apps/api on :7777 and apps/web on :5173, in parallel
pnpm build                   # both apps
pnpm typecheck               # tsc --noEmit in both apps
pnpm test                    # apps/api vitest — domain tests, no I/O, no subprocesses
pnpm skills:check            # py_compile every script under skills/

# one app at a time
pnpm --filter @aidlc-console/api dev
pnpm --filter @aidlc-console/web dev
```

Or in containers — same API image both ways, only the web service differs:

```bash
cp .env.example .env                 # AIDLC_WORKSPACE is required, the rest have defaults
docker compose up -d --build         # nginx + built SPA on :8080
docker compose --profile dev up      # vite dev server with HMR on :5173 instead
docker compose build api             # after ANY change under skills/ — see below
docker compose logs -f api
```

The Docker path inverts one default worth remembering: the API image **bakes `skills/` in**
at `/opt/aidlc/skills`, so containers always drive this working tree's controller, while a
native run defaults to the installed copies under `~/.claude/skills/`. A change to `skills/`
is therefore invisible to a running container until `docker compose build api`.

`AIDLC_WORKSPACE` is bind-mounted at the *same absolute path* inside the container as
outside. That is deliberate and load-bearing: the repository registry stores absolute host
paths, so identical paths are what let a repo tracked natively resolve inside the container.

Two features do not survive containerisation, both by design rather than by bug: agent
launching (the launcher resolves `claude` / `codex` / `cursor-agent` / `copilot` off `PATH`,
and the image has none of them) and browser verification (no Playwright in the image, so
`verify.py` resolves to a reporting rung). Both degrade honestly rather than erroring. Run
natively when you need either.

### State drivers

`AIDLC_STORE` selects what backs the console's own state, and the choice is made once in
`shared/shared.module.ts` rather than branched on inside each adapter:

| Port | `file` | `postgres` |
| ---- | ------ | ---------- |
| `REPOSITORY_REGISTRY` | `JsonRepositoryRegistry` | `PgRepositoryRegistry` |
| `CONSOLE_SETTINGS` | `FileConsoleSettings` | `PgConsoleSettings` |
| `AGENT_DEFINITION_SOURCE` | `FileAgentDefinitionSource` | `PgAgentDefinitionSource` |
| `AGENT_RUN_STORE` | `FileAgentRunStore` | `PgAgentRunStore` |
| `EVIDENCE_STORE` | `CasEvidenceStore` | `MinioEvidenceStore` |
| `PLAN_CACHE` | `PlanCache` (in-process) | `RedisPubSubPlanCache` (in-process + pub/sub) |

Nothing about **plan** state moves. Every `Filesystem*Reader`, the three `Cli*` adapters and
the plan watcher still work against `.ai/` on disk, because that is the source of truth and
the controller is a subprocess. A database driver changes where the console remembers *which
folders it watches*, never what a gate says.

Two things to know when adding to this:

- **The plan cache never serialises.** `FeatureSnapshot` holds live aggregates, so anything
  that JSON round-trips returns prototype-less objects on a *hit* — the first request
  succeeds and the second dies on `construction.graph.criticalPath is not a function`. The
  Postgres driver therefore keeps snapshots in-process and uses Redis only to broadcast
  invalidations, which is what cross-replica coherence actually needed.
  `test/plan-cache.spec.ts` asserts a cached value comes back with its methods intact.

- **Schema lives in `shared/infrastructure/db/migrations.ts`, as inline SQL.** `nest build`
  compiles TypeScript and copies nothing else, so a `.sql` directory would exist in the repo
  and be missing from `dist/` — failing at boot in the container and nowhere else. Never edit
  a shipped step; append. `test/migrations.spec.ts` guards the mistakes that cost a boot
  (backticks inside the template literal, reserved words as column names, a `CREATE` without
  `IF NOT EXISTS`).
- **Migrations run under an advisory lock**, which is what makes more than one API replica
  safe to start at once.

The API resolves the controller through `AIDLC_CORE_PATH`, which defaults to
`~/.claude/skills/ai-dlc-core` — the *installed* copy, **not** `skills/ai-dlc-core` in this
working tree. When a change spans both halves, point `apps/api/.env` at
`<this-repo>/skills/ai-dlc-core` or the console will keep exercising the last-installed
version and the change will appear to have no effect.

Because `apps/api` shells out to those scripts, a `RULESET` bump or a frontmatter-schema change
under `skills/` can break the console's parsers silently — `apps/api/src/contexts/planning/
infrastructure/filesystem-feature-plan.reader.ts` deliberately mirrors `REQUIRED_INTENT_SECTIONS`
and `assumption_rows` from `aidlc.py`. Run `pnpm test` after touching either side.

## Architecture

### The controller pattern, and why it's structured this way

The core design decision (stated explicitly in `skills/ai-dlc-core/SKILL.md`) is that **gates are
enforced by a program, not by prose**. An instruction like "don't implement before G3" gets
agreed to and then skipped by an agent under time pressure; a state file that a script refuses
to advance without satisfying machine-checkable preconditions does not. Every script here is
stdlib-only and read-mostly (discovery scripts never write outside their `-o` target) so that
the controller itself can't become a new thing to trust blindly.

Concretely:

- **`aidlc.py`** owns the state of a feature directory (`.ai/features/<slug>/` in the target
  repo). The **record** is `history.jsonl`: one JSON event per line, append-only, never
  rewritten, declared `merge=union` by a `.gitattributes` the script writes itself — so two
  checkouts that both approve something merge without a conflict and without losing either
  entry. `.aidlc-state.yaml` is a **view** folded from that trail (`fold_gate`), still written
  and still committed so existing readers keep working; when a merge damages it,
  `aidlc reconcile` rebuilds it. Never set `current_gate` in a new code path — append an
  event and let the fold decide, or the file and the record can drift.
  Every mutating command takes an exclusive `flock` on `.aidlc-state.lock` **for the whole
  read-check-write**, not just the write: the preconditions are what the approval claims to
  be based on, so evaluating them outside the lock lets the trail record an approval for a
  state that had already changed. `save_state` and the ticket rewrite go through
  `write_atomic` (temp file, fsync, `os.replace`) — `open(path, "w")` truncates first, and a
  crash in that window empties the only durable copy of the trail. It tracks the current gate
  (`G0`…`G5`) and who passed/reopened what and when. `CHECKS = {"G0": check_g0, ...}` (near the bottom of the
  file) is the actual precondition logic per gate — read that dict and its functions, not
  `SKILL.md`'s table, when you need the exact rule. State transitions only move forward
  (`pass`) or explicitly backward with a recorded reason (`reopen`); there is no way to jump
  a gate. Ticket lifecycle (`start`/`submit`/`accept`/`reject`/`done`) is a second, separate
  state machine gated by `ALLOWED_FROM`, enforcing that only a human can `accept` (never the
  same actor that `submit`ted) unless `--no-review` is passed, which itself gets recorded in
  the audit trail rather than hidden.
- **The hooks under `plugin/ai-dlc/hooks/` are this same pattern one level down.** The
  controller refuses to advance a gate whose preconditions are unmet; the hooks refuse the tool
  calls that would corrupt the record those preconditions are computed from. Every rule in
  `block_dangerous.py`'s second class is a rule stated in prose elsewhere in this file — never
  hand-edit the three generated files, never set `current_gate` directly, `history.jsonl` is
  append-only, `verified_by` is a human's signature — and prose is exactly the enforcement this
  project is premised on not trusting. Two properties are load-bearing there and a change must
  preserve both: **a hook never exits non-zero** (a matched rule denies by printing a decision;
  an internal error allows and prints a `systemMessage`), and every denial names its rule id
  and says what to do instead. The first is the same argument as `verify.py`'s `skipped` rung —
  a guard that fails loudly on ordinary work gets switched off, and a switched-off guard is
  worse than an absent one. Detection is heuristic, so `.claude/aidlc-hooks.json` carries
  `allow_paths` / `allow_patterns` / `disabled_rules`, and a false positive is fixed there
  rather than by disabling the plugin.
- **`uow_graph.py`** is the thing `aidlc.py` shells out to (via `run_uow_graph`, a
  subprocess call resolved relative to `aidlc.py`'s own directory — both scripts must stay
  siblings inside `skills/ai-dlc-core/scripts/`) for G3 and G5 checks, and is also runnable
  standalone. It has its own tiny YAML-subset frontmatter parser (`parse_frontmatter`) —
  deliberately not a real YAML parser, since the schema is fixed and controlled. It loads
  every `04-units-of-work/UOW-*/uow.md` and `tickets/T-*.md`, validates cross-references
  (`depends_on`/`blocks` symmetry, unknown ids, cycles via Kahn's algorithm, AC coverage,
  ticket-hour ceilings, UoW elapsed-time ceilings, write-conflict hazards between tickets with
  no ordering constraint), then — only with `--write` — regenerates three derived files:
  `05-ticket-graph.md`, `06-traceability.md`, `registry.yaml`. **Never hand-edit those
  three**; they're regenerated from the tickets specifically so they can't drift from them.
- **`aidlc.py` reuses `uow_graph.py`'s parser by importing it** (`parse_frontmatter_files`,
  `_critical_hours` insert `skills/ai-dlc-core/scripts/` onto `sys.path` at runtime) rather than
  reimplementing frontmatter parsing, so the two scripts can never disagree about what a
  ticket says. If you change `parse_frontmatter` or `load_plan` in `uow_graph.py`, you are
  changing what `aidlc.py` sees too.
- **`project_registry.py`** builds a *disposable* SQLite read model (drop it, re-scan, get an
  identical result — nothing is ever written there that isn't recoverable from files) across
  potentially many repos' `.ai/` directories. It intentionally does **not** parse the
  generated `registry.yaml` for its `--scan` path — it re-derives everything from the
  hand-written tickets via `uow_graph.load_plan` (imported the same way `aidlc.py` does), so a
  repo that `.gitignore`s its generated artifacts (the recommended setup, per
  `skills/ai-dlc-core/references/sync.md`) still reports correctly. Two tables, `gate_event` and
  `snapshot_log`, are the sole exception to "disposable": they're `INSERT OR IGNORE`
  (append-only, deduplicated on natural key) because when a target repo doesn't commit `.ai/`
  to git, the JSON snapshot stream is the *only* durable copy of who approved what.
- **`discover_generic.py`** (in `ai-dlc-core`) and **`discover_repo.py`** (Flutter-specific,
  in the `examples/profile-flutter` example) never write anything except their `-o`
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
  directory), and reaches for `skills/ai-dlc-core/scripts/uow_graph.py` to read UoW frontmatter with
  core's own parser — trying `$AIDLC_CORE`, then `../../ai-dlc-core/scripts`, then
  `~/.claude/skills/ai-dlc-core/scripts`. Its fallback reads only `id` and `verifies`, a
  deliberately narrower contract than the full schema.
- **`08-evidence.md`, `evidence/` and `.ai/.auth/` are generated or secret.** They belong in the
  target repo's `.gitignore` alongside core's three generated files. `.ai/credentials.env` is
  *not* matched by a `.env*` pattern — check with `git check-ignore -v`.

### Versioning discipline: `RULESET`

`uow_graph.py` defines `RULESET = 5` and `check_ruleset()` refuses to silently re-judge a
plan authored under different validation rules — the target repo pins its ruleset in
`.ai/aidlc.yaml`, and a mismatch is surfaced as an explicit warning rather than a mysterious
new failure. **Bump `RULESET` whenever you change validation in a way that could make a
previously-valid plan fail**, and bump `__version__` for any other change. This is the one
number that must not be changed casually — it's the seam that lets this tooling evolve
without silently invalidating plans in every repo that uses it.

Compatibility is **per plan, not per repo**: `aidlc init` stamps the tool's ruleset into
`.aidlc-state.yaml`, an unstamped plan is judged under ruleset 4, and the `ruleset:` pin in
`.ai/aidlc.yaml` is advisory — so `warn: plan was authored under ruleset 4, tool enforces 5`
on this repo's own feature is the design working, not a defect (`docs/PILOT-RUNBOOK.md`, the
ruleset-5 upgrade note).

`verify.py` carries its own `RULESET` that **mirrors** core's rather than judging
independently (`# tracks ai-dlc-core's uow_graph.RULESET; bump together`) — it gates no
behaviour, `ruleset_warning()` only compares it to the repo pin. Both are at 5. Keep them
there in one commit: verify's check is exact equality, not `<`, so a package left behind
warns on precisely the repos core considers current.

### Frontmatter schemas are contracts

The YAML-ish frontmatter keys in `00-intent.md`, `01-assumptions.md` (table columns, in a
fixed order), `uow.md`, and ticket files are parsed by regex/line-based logic in both
`aidlc.py` and `uow_graph.py`, not a real parser. A typo in a key name, a reordered
assumption-table column, or a renamed section heading (e.g. `REQUIRED_INTENT_SECTIONS`,
`REQUIRED_DESIGN_SECTIONS` in `aidlc.py`) breaks the graph or a gate check silently returning
"missing" rather than erroring loudly. `skills/ai-dlc-core/references/templates.md` is the canonical
shape reference — if you change what a script expects, update `templates.md` in the same
change, and bump `RULESET` if the change affects validation of existing plans.

### Reading order for reference docs

These are read by the *skill*, at the phase that needs them — not meant to be read cover to
cover:

- `skills/ai-dlc-core/references/methodology.md` — what each phase (0–5) does and why each gate
  exists; read this to understand intended behavior before changing a `check_gN` function in
  `aidlc.py`.
- `skills/ai-dlc-core/references/discovery-protocol.md` — discoverable-vs-undiscoverable framing for
  Phase 0.
- `skills/ai-dlc-core/references/templates.md` — the artifact/frontmatter shapes; **the source of
  truth for schema**.
- `skills/ai-dlc-core/references/profile-contract.md` — the interface a stack profile (e.g.
  `examples/profile-flutter/`) must implement: `SKILL.md` + `references/<stack>-rules.md`
  + `scripts/discover_repo.py`.
- `skills/ai-dlc-core/references/sync.md` — how a target repo gets its `.ai/` plan state into a
  central report (commit to git and let `project_registry.py --scan` pull, or emit portable
  JSON via `aidlc snapshot` and push); explains the `.gitignore` convention for the three
  generated files.
- `examples/profile-flutter/references/flutter-rules.md` — layer boundaries, BLoC shape,
  the `sample_ui_kit` reuse inventory, banned-construct table, and the concrete
  definition-of-done for the example Flutter monorepo — read this as the model for a real
  `<stack>-rules.md` when writing a new profile.
- `docs/PILOT-RUNBOOK.md` — an end-to-end dry run of both packages together on a real
  repo, including a documented bug found during that run (the frontmatter parser was
  stripping `# new` comment markers off `touches` list items). Read this first — it's a
  working example of every command in sequence with expected output.
- `docs/console.md` — the console's design: the one rule the whole thing hangs on (it never
  writes plan state), why repositories are grouped into projects, the evidence CAS and the
  agent-launcher integration, and how to run it locally. Read before touching `apps/`.

### Working across the skill/profile boundary

`ai-dlc-core` is the methodology (gates, graph, controller); a stack profile is taste
(conventions, DoD, its own discovery script) for one specific repo. `examples/profile-flutter`
is that shape worked out for a sample Flutter monorepo — read it as a worked example, not as
something to register against a real project. Don't add framework-specific logic to
`ai-dlc-core` — it belongs in a profile. Conversely, don't duplicate workflow/gate logic into a
profile; the example's `SKILL.md` is deliberately thin and defers to `ai-dlc-core` for
everything except conventions and discovery. A new, real stack profile follows the same
shape — see `skills/ai-dlc-core/references/profile-contract.md`, in particular the requirement that a
profile's `SKILL.md` name concrete path markers (e.g. `apps/sample_app`, `packages/sample_*`) so it
doesn't get picked for the wrong repo.
