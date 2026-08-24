# AI-DLC Console

A portfolio view and control plane for [AI-DLC](../README.md) plans spread across many
repositories. Two sources: a **NestJS 11** API (`apps/api/`) and a **React 19 + Ant Design 6**
client (`apps/web/`), in a pnpm workspace.

It lives in the same repository as the skills it drives: the controller scripts it shells
out to are the ones under [`skills/ai-dlc-core/scripts/`](../skills/ai-dlc-core/scripts).

It answers the questions no single plan file can: where does every feature stand, what is
waiting on a person right now, and what can actually be picked up today — across every
checkout on this machine.

```
┌──────────────┐   HTTP + socket.io   ┌──────────────┐  subprocess  ┌────────────────┐
│  web/        │─────────────────────>│  api/        │─────────────>│  aidlc.py      │
│  React 19    │<─────────────────────│  NestJS 11   │<─────────────│  uow_graph.py  │
│  Ant Design  │   plan.changed       └──────┬───────┘   verdicts   └────────┬───────┘
└──────────────┘                             │ reads                         │ writes
                                             ▼                               ▼
                                      .ai/features/<slug>/  ← the source of truth
```

## The one rule the whole design hangs on

**The console never writes plan state itself.** Not `.aidlc-state.yaml`, not a ticket's
`status:` line, not the three generated files. Every mutation is a subprocess call to
`aidlc.py` or `uow_graph.py`, and the controller's answer — including its refusals — is
shown verbatim, with the command that produced it.

This is not caution, it is the point. AI-DLC's gates hold because exactly one program
decides what a gate means. A UI that writes state behind the controller's back turns those
gates back into prose, which is the failure mode the method exists to prevent. The console
is a *read model plus a remote control*, and nothing more.

The corollary: everything the console shows is disposable. Delete its state, rescan, and
you get an identical result — because the files are the write model and the console only
ever projects them.

## What is in it

| Screen             | Question it answers                                                                                                                                                                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inbox**          | What is stopped and waiting on a person? Blocking assumptions, gates whose preconditions now pass, tickets in review, undecided ADRs, uncovered criteria, parallel write collisions, plans outside the controller. Deliberately no progress — a list that mixes "twelve tickets moved" with "four plans cannot start" trains you to skim it. |
| **Pickable now**   | Which tickets could be started right now, anywhere? Dependencies satisfied, feature past G3. Sorted by how much each one unblocks rather than by size.                                                                                                                                                                                       |
| **Portfolio**      | Where does every feature stand? Gate, ticket progress, critical path, AC coverage, and where plans have drifted out of the controller's reach.                                                                                                                                                                                               |
| **Feature**        | One feature in full: gate track, precondition verdicts, assumption register, traceability, slices with their demo scripts and definitions of done, the ticket graph as execution waves, and the audit trail.                                                                                                                                 |
| **Approval trail** | Who approved what, portfolio-wide. On repos that do not commit `.ai/`, this is the only durable record.                                                                                                                                                                                                                                      |
| **Board**          | Every ticket in scope as columns, with swimlanes. Not drag-and-drop: every column boundary is a controller transition with real preconditions, and a card that slides across would either lie or snap back.                                                                                                                                  |
| **Agent runs**     | Every agent CLI this console has handed a ticket to, with its live transcript.                                                                                                                                                                                                                                                               |
| **Repositories**   | Which checkouts the console reads. The only state it owns.                                                                                                                                                                                                                                                                                   |

Plus `⌘K` search across every feature, slice, ticket, criterion and assumption, and `c` to
start a new feature in any repository. Every list view carries the same **Filter** and
**Display** controls — filter by project, checkout, branch, feature, status, layer, type,
risk, gate or unit of work; group by any of them; choose what the rows show.

## Projects, and why they are not repositories

A portfolio does not group cleanly by directory. Two clones of one repository on two
branches hold the *same plan files*, so reading them as separate projects doubles every
count and makes the portfolio look twice as busy as it is — in this one, nine checkouts are
eight projects, and one project's board went from 1,000 tickets to 507 once they were
merged.

Grouping is derived, in this order:

1. **Override** — pinned by hand on the Repositories page. For two clones with different
   remotes that are still one project, or two sharing a remote that are genuinely managed
   apart. Only a person knows.
2. **Worktree** — `git rev-parse --git-common-dir` differs from `--git-dir`.
3. **Remote** — the ordinary case: `git@github.com:owner/repo.git` and
   `https://github.com/owner/repo` are the same project.
4. **Path** — no git, or no remote. A project of one.

On a board, a ticket found in several checkouts of one project collapses into a single
card. Where the checkouts *disagree* about its status, the card takes the least advanced
one and says so — a ticket done on `main` and still todo on a feature branch is not
finished, and filing it under Done would answer "is there work left" with a lie.

## Two integrations worth their own paragraph

**Browser verification (`ai-dlc-verify`).** The Verification tab resolves the ladder for
this machine — `not applicable`, `skipped`, `capable`, `config error` — runs the browser
walk, and shows the screenshots and per-step verdicts inline. **Archive evidence** hashes
those screenshots into a content-addressed store under `~/.aidlc-console/evidence-cas/` and
writes `evidence-manifest.json` next to the plan. The manifest is small, textual and meant
to be committed: it records which screenshots a run produced and the hash of each, so a
teammate who never ran the browser can at least see what the evidence claims, and verify
the bytes once they have them. Identical screenshots across runs are stored once. Moving
the bytes between machines needs a shared backend behind `EvidenceStorePort` — S3 or
MinIO — which is a deployment choice, not a code one. `--write` is offered on the
`capable` rung only: writing the evidence block anywhere else produces checkboxes the
project can never tick, and `check_g4` counts unticked boxes.

The rung is a property of the *project*; whether Playwright is installed is a property of
the *machine*, and the two need different fixes. **Configure → Setup** handles the second:
it reports what is missing, offers an existing interpreter if you already have one, and
otherwise creates a venv, installs Playwright and downloads Chromium with the output
streamed live. Nothing goes into the system Python and nothing is written to a repository.

**Agent launcher.** Hand a ticket to Claude Code, Codex, Cursor, Copilot — or anything you
declare in `~/.aidlc-console/agents.json`. An entry is just a binary and its flags, so one
CLI can appear several times with different models: plan on Opus, implement and test on
Sonnet. Where a CLI emits `--output-format stream-json` the console parses it and shows
what the agent is doing *right now* — `Bash — pnpm test`, `Edit — src/refund.ts` — plus the
run's model, tool-call count and dollar cost, and the session id that makes a rejected
ticket resumable rather than restartable. Every other CLI prints prose and is displayed
exactly as before; the parser returns nothing rather than guessing. The agent is handed the plan's own context: the
ticket body, the slice's demo script, the acceptance criteria it claims, and the files it
declared it would touch. Before anything spawns, the console asks the controller to move
the ticket to `in_progress` under the agent's name; if the controller refuses — gate below
G3, a dependency not done — nothing starts. When the agent finishes, a person still has to
review and accept. Agents are subject to the same gates as people, which is the only
reading of "agents as teammates" that does not quietly route around the method.

## Getting started

Prerequisites: Node 22+, pnpm 10+, Python 3, and `ai-dlc-core` installed (by default at
`~/.claude/skills/ai-dlc-core`). `ai-dlc-verify` is picked up automatically if it sits
next to core.

```bash
pnpm install

cd apps/api && cp .env.example .env   # only if your skills live somewhere unusual, or to
                                      # set AIDLC_TRUSTED_USER_HEADER for a shared deploy
cd ../.. && pnpm dev                  # API on :7777, client on :5173
```

Or run them separately:

```bash
pnpm --filter @aidlc-console/api dev
pnpm --filter @aidlc-console/web dev
```

Then open the client, go to **Repositories → Add repository**, and either paste a path or
scan a parent folder — the scan finds every checkout containing `.ai/features/`.

Before your first gate approval or ticket move, set your name in the top-right. It is not
decoration: it goes into an append-only trail inside the repo, permanently.

### Running agents while the services stay in Docker

Agent CLIs are not in any image and cannot usefully be put there — a repo's `node_modules`
holds binaries compiled for the host, so an agent inside the Linux image fails on the first
`pnpm test` its definition-of-done asks for. That does not mean giving up the containers:

```bash
pnpm services      # postgres + redis + minio only
pnpm dev:hybrid    # the API and client on this machine, pointed at those services
```

The API is then a normal local process — `claude` is on its `PATH`, it has your credentials,
and it spawns the agent in your own shell — while the registry, evidence and cache stay
exactly where `docker compose up` left them. The console reports `containerized: false`, so
the launcher stops warning and the agents become selectable.

### In Docker instead

```bash
cp .env.example .env          # set AIDLC_WORKSPACE to the directory holding your repos
docker compose up -d --build  # → http://localhost:8080
docker compose --profile dev up   # vite + HMR on :5173 instead of the built SPA
```

nginx serves the SPA and proxies `/api` and the `/events` socket to the API container, which
keeps the browser same-origin exactly as the vite proxy does in development. The API image
bakes in `skills/` from the repo rather than reading `~/.claude/skills/`, so rebuild it after
changing a controller script. Agent launching and Playwright verification are unavailable in
the container — see the repo README for why.

### Picking a folder

The Add-repositories dialog browses instead of asking you to type a path. That browsing is
served by the API, not the browser, and it has to be: a web page cannot learn an absolute
path. `showDirectoryPicker()` hands back a handle whose only identity is `.name`, and
`<input webkitdirectory>` yields paths relative to the folder you chose — neither produces
the `/Users/you/work/some-repo` the registry stores. So `GET /api/repositories/browse` lists
directories from the side that actually has a filesystem, marking each one that has a `.git`,
an `.ai/`, or is already tracked.

`AIDLC_BROWSE_ROOTS` bounds the walk, defaulting to the home directory of whoever runs the
API, and compose sets it to the mounted workspace. The bound matters: browsing is a
directory-disclosure surface, and unbounded it hands the layout of the whole host to anyone
who can reach the API. The check compares path segments rather than string prefixes, so a
sibling named `/work-evil` is not treated as inside `/work`.

There is also a real OS dialog — `POST /api/repositories/pick-folder`, which runs
`osascript -e 'choose folder'` and returns the chosen path. It only appears when the API can
actually show a window: same machine as the browser, macOS, not in a container. In Docker the
picker says *Finder unavailable* rather than offering a button that cannot work, because the
container has no window server and its filesystem is not yours anyway.

### Where the console keeps its own state

Two drivers, chosen by `AIDLC_STORE`:

- **`file`** (the default, and what `pnpm dev` uses) — everything under
  `~/.aidlc-console/`: `repositories.json`, `settings.json`, `agents.json`, `runs/`, and a
  content-addressed `evidence-cas/`. No infrastructure to start.
- **`postgres`** (what compose sets) — the registry, settings, agent definitions and run
  transcripts in Postgres; evidence blobs in MinIO, still named by their own hash; the
  plan-cache invalidations broadcast over Redis.

The JSON adapters were right for a laptop and the reasoning in their comments still holds:
this is a few kilobytes of "which folders am I watching", and losing it costs one rescan.
What they do not survive is a container — a JSON file lives in one process's filesystem, so
two API replicas disagree about what is tracked and a redeploy starts from nothing. Size was
never the argument; deployment is.

**Plan data is in neither driver.** `.ai/` on disk stays the source of truth, which is the
same rule the whole console hangs on: it never writes plan state, it calls the controller.
That is also why containers still bind-mount the repositories — the mount is not console
state, it is the files `aidlc.py` has to read and write.

Two details worth knowing:

**Evidence outgrew `locate()`.** The port used to hand back a local path, which quietly
assumed every backend was a filesystem. It is now `has()` for the existence check and
`open()` for a stream, so the controller streams bytes instead of buffering a screenshot set
into memory to answer one request. Blob metadata is mirrored into Postgres so
"how much is held?" stays one query rather than a full bucket listing that gets slower for
the life of the deployment.

**The plan cache is never stored in Redis, only invalidated through it.** A
`FeatureSnapshot` holds live aggregates — `ConstructionPlan.graph.criticalPath()`,
`repository.id.value` — so anything that JSON round-trips hands back prototype-less objects
on a *hit*. That shipped once: the first request to `/api/portfolio` succeeded and the second
returned `construction.graph.criticalPath is not a function`.

What made Redis worth adding was never storage; it was coherence. A plan edited through one
replica must not stay stale on another for a whole TTL. So snapshots live in-process and only
the *invalidation* is published, which gets the coherence without serialising a single
aggregate. Rehydrating four aggregate types out of JSON would have been a large surface that
breaks silently whenever a model grows a field, and it buys nothing: the files are the source
of truth and a miss costs one re-read.

### Verifying the install

```bash
pnpm test                    # domain tests, no I/O, no subprocesses
curl localhost:7777/api/maintenance/status
```

If `tooling.available` is `false`, reads still work but every gate and ticket action will
fail. The `error` field says why.

## The Skills page

The console also ships the skill packages it drives. `apps/api/src/contexts/skills/` scans
`AIDLC_SKILL_SOURCES` — this checkout's `skills/` and `examples/` by default — for any
directory holding a `SKILL.md`, reads the `scope:` out of its frontmatter, and compares each
package against every place it could be installed.

Scope decides the targets, and the server enforces it rather than trusting the request:

- **`global`** — one target, `~/.claude/skills/<id>`. The action is *sync*.
- **`project`** — one target per tracked repository, `<repo>/.claude/skills/<id>`. The action
  is *install*. With nothing tracked there are no targets, and the page says so instead of
  offering a button that cannot work.

Asking to sync a project skill machine-wide is refused, in the controller's own voice
(`refused: profile-flutter is a project skill — name the repository to install it into`).
That asymmetry is the whole point of declaring scope: a stack profile installed globally
starts competing to answer for repositories it knows nothing about.

Two implementation choices worth knowing:

**Comparison is a content digest, not an mtime.** Copying does not preserve timestamps
faithfully across filesystems, so `stat()` cannot answer "is this copy current?". The digest
hashes each file's path alongside its bytes, and deliberately skips `__pycache__` and
`.pyc` — without that, running a controller script once would make every global skill read
as out of date one command after being synced. This is why the state is labelled `differs`
rather than `outdated`: a target edited by hand differs too, and syncing overwrites it.

**Installing replaces rather than merges.** The copy is staged beside the target and moved
into place, so a failure part-way leaves the existing package untouched instead of a
half-written skill that still loads. Replacing also means a file dropped upstream actually
disappears at the target, instead of living on forever and being referenced by a `SKILL.md`
that no longer mentions it.

## What happens to a ticket around an agent run

The console makes two controller calls per run, and neither of them is `accept`:

1. **Before launching** — `start`, moving the ticket `todo → in_progress`. The controller
   decides; a ticket whose dependencies are unfinished is refused and no agent is spawned.
2. **After a clean exit** — `submit`, moving it `in_progress → review`.

Step 2 is why the briefing can tell the agent *"do not run `aidlc pass` or `aidlc accept` —
the console moves the ticket for you"*. That promise was made before it was kept: the
launcher used to stop after saving the transcript, so a successful run left the ticket in
`in_progress` and nobody could tell finished work from abandoned work.

A failed or cancelled run is never handed off — there is nothing to give a reviewer. And a
`submit` the controller refuses (any done-when box still unticked) is left refused, with its
reason written into the transcript: the ticket honestly stays `in_progress`.

`accept` is never called by anything. Moving a ticket to `done` is a person's judgement, and
an agent accepting its own work is the single failure this method exists to prevent.

## Security posture, stated plainly

**Nothing in this console authenticates.** `AIDLC_TRUSTED_USER_HEADER` decides whose *name*
goes into an audit trail; it is not access control, and when it is unset the name simply
comes from the client. Anyone who can reach the API can browse the filesystem within
`AIDLC_BROWSE_ROOTS`, drive the controller against any tracked repository, install skill
packages, and — on a native run — launch agent CLIs, which is arbitrary code execution as
whoever started the process.

That is a reasonable design for a tool on one person's laptop. It stops being reasonable the
moment the port is reachable by anyone else, so every published port binds to `127.0.0.1` by
default, in compose via `BIND_ADDR` and natively via `HOST`. Docker publishes to `0.0.0.0`
unless told otherwise, and NestJS binds every interface unless told otherwise; both defaults
would have put the above on the local network.

Move either off loopback only behind something that authenticates, and set
`AIDLC_TRUSTED_USER_HEADER` when you do — otherwise the approval trail records whatever name
the client claimed, which is not evidence.

The Postgres and MinIO credentials in `.env.example` are development defaults committed to
git. They are fine while everything is on loopback and must be changed before it is not.
Postgres and Redis are never published at all; MinIO publishes only its web console.

## Two things worth knowing before you trust a screen

**Gate verdicts are only as fresh as the last check.** Running `aidlc check` costs a python
subprocess that re-parses the whole plan, so the console reports only what it has actually
run and says how many features it has not. **Sweep gates** on the Inbox fills the gaps in
the background. A cached verdict is evidence of a past check, never a substitute — `pass`
re-runs the preconditions inside the controller regardless.

**Review is a state machine, not an identity check.** `aidlc.py` enforces that work passes
*through* review (`ALLOWED_FROM["done"] = {"review", "done"}`), but it does not compare the
submitter's name with the accepter's. The console surfaces a self-accept and names who
submitted, and then lets you through — adding an enforcement of its own would put a second
decision-maker in a system whose whole value is having exactly one.

**Whether the name in the trail means anything is a deployment setting.** By default the
console takes the acting name from the client, which is right for one person on a laptop
and is *not* evidence for a team: anyone can record an approval under anyone's name, into
an append-only file, permanently. Put the console behind something that authenticates —
oauth2-proxy, an OIDC ingress, Tailscale, Cloudflare Access — and set
`AIDLC_TRUSTED_USER_HEADER` to the header it sets. The server then takes every `--by` from
that header and ignores the request body, and fails closed if the header is missing rather
than falling back. `GET /api/maintenance/status` reports which mode is live, so nobody has
to guess whether the approval trail is attributable.

## Layout

```
apps/api/    NestJS, Clean Architecture + DDD — see apps/api/README.md
apps/web/    React + Ant Design, feature-sliced — see apps/web/README.md
```

Six bounded contexts on the API side: `portfolio`, `planning`, `construction`,
`governance`, `verification`, `agents`, plus an `insight` read model that composes them.
