# AI-DLC Console — API

NestJS 11, TypeScript, no database. Clean Architecture with DDD tactical patterns.

## Why there is no database

The obvious move is Postgres. It would be wrong here. The plan files in each repo's `.ai/`
directory *are* the write model — versioned with the code, reviewed in pull requests, and
the thing the gate controller enforces against. A second copy in a database would start
drifting from them the moment anyone edited a file outside the console, and then two
sources would disagree about whether a ticket is done.

So the only thing persisted is the list of tracked repositories, in a JSON file under
`~/.aidlc-console/`. It is a few kilobytes, single-user, and losing it costs one rescan.
Everything else is parsed from the repos on demand and memoised behind a TTL that a
filesystem watcher punches through.

## The layers

Dependencies point inward. Domain code imports nothing from NestJS.

```
interface/        controllers, DTOs, validation      ─┐
application/      use cases and queries               │ depend inward
domain/           entities, value objects, ports      │
infrastructure/   adapters that implement the ports  ─┘ (bound in the module)
```

A port is a `Symbol` plus an interface in `domain/ports/`. The module binds it to an
adapter and nothing else knows which one:

```ts
{ provide: GATE_CONTROLLER, useClass: CliGateController }
```

## Bounded contexts

| Context | Owns | Aggregate root |
| --- | --- | --- |
| `portfolio` | Which checkouts are tracked, what each declares in `.ai/aidlc.yaml`, and which project they belong to | `TrackedRepository` |
| `planning` | Intent, assumption register, requirements, ADRs | `FeaturePlan` |
| `construction` | Units of work, tickets, and the graph over them | `ConstructionPlan` |
| `governance` | Gate state, verdicts, the approval trail | `GateState` |
| `verification` | The ai-dlc-verify ladder, runs, and evidence | `VerificationPlan` |
| `agents` | Agent CLIs, launches, and their transcripts | `AgentRun` |
| `insight` | The read model: portfolio, inbox, ready queue, search, feature detail | — (CQRS read side) |

`insight` is the only module that knows about more than one context, and that is
deliberate. "Where does every feature stand" is inherently cross-context; pushing it down
into `planning` or `governance` would make one of them depend on the other two. Here it
depends on all three, and nothing depends on it except the transport.

A feature's identity across all of them is `FeatureRef { repositoryId, slug }`, in the
shared kernel. Each context models a *different aspect* of the same feature and shares no
aggregate with the others.

`ProjectGroupingService` is a pure domain service — a function of the repositories handed
to it, with no filesystem — so the rules that decide "these two checkouts are one project"
can be reasoned about and tested directly. See `test/project-grouping.spec.ts`.

## The write path

Two process runners, deliberately:

- **`ProcessRunner`** buffers, and is bounded by a concurrency limit so a
  hundred-and-twenty-feature gate sweep does not fork a hundred and twenty pythons. Right
  for controller calls measured in hundreds of milliseconds. Used by
  `CliGateController`, `CliPlanMutator` and `CliVerificationController`.
- **`startStreamingProcess`** streams line by line and is cancellable. Right for an agent
  CLI that runs for minutes and produces output the whole time — buffering that would mean
  a spinner followed by a wall of text after the interesting part is over.

Every one of them returns the exit code, stdout and stderr untouched.

There is no adapter that edits a `status:` line. There must never be one. See the note in
`construction/domain/ports/plan-mutator.port.ts` for why.

### The one deliberate exception

`FilesystemFeatureScaffoldWriter` writes `00-intent.md`, once, immediately after
`aidlc init` and only while the file is still the untouched scaffold the controller just
wrote. Intent is authored content, not gate state, and refusing to overwrite anything else
is what keeps it from becoming a general-purpose plan editor fighting every other author
of that file.

## The parsers

`shared/infrastructure/text/frontmatter.parser.ts` is a deliberate line-by-line port of
`parse_frontmatter` in `uow_graph.py` — not a YAML library. The console must see exactly
what the controller sees; a permissive parser would happily read a file the controller
rejects, and the console would then show a green badge on a plan that cannot pass its gate.

The subtle rule a rewrite gets wrong: trailing comments are stripped from scalars but not
from list items, because `touches:` uses `- src/new.ts  # new` to declare a file that does
not exist yet. There is a test for it.

`TicketGraph` is the same kind of port for the graph algorithms — waves, critical path,
ready tickets, write conflicts.

## Commands

```bash
pnpm dev           # watch mode
pnpm build         # tsc -> dist/
pnpm test          # domain tests, no I/O, no subprocesses
pnpm typecheck
```

## Configuration

Everything is in `.env` (see `.env.example`). The two that matter:

- `AIDLC_CORE_PATH` — where `ai-dlc-core` is installed. `scripts/aidlc.py` must be under it.
- `AIDLC_PYTHON` — the interpreter. Must be python3.

At boot the API runs `uow_graph.py --version` and logs the version and ruleset. If that
fails, it logs an error and keeps serving reads — a read-only console is more useful than
one that will not start.

## API surface

```
GET    /api/search           ?q&limit                       features, slices, tickets, AC, assumptions
POST   /api/board                                           { scope, filters, mergeCheckouts } -> cards + facets
GET    /api/repositories/projects                           checkouts grouped into projects
PATCH  /api/repositories/:id                                { label?, projectOverride? }

GET    /api/runner                                          can this machine drive a browser?
POST   /api/runner/install                                  venv + playwright + chromium, streamed
POST   /api/runner/use-interpreter                          { interpreter }
POST   /api/features                                        aidlc init + the intent scaffold

GET    /api/features/:repositoryId/:slug/verification       resolve the ai-dlc-verify ladder
POST   /api/features/:repositoryId/:slug/verification/run   { environments?, viewports?, write? }
POST   /api/features/:repositoryId/:slug/verification/check-evidence
GET    /api/features/:repositoryId/:slug/verification/artifact?path=   a screenshot

GET    /api/agents                                          agent CLIs found on this machine
GET    /api/agent-runs       ?repositoryId&slug&ticketId&active
GET    /api/agent-runs/:id                                  summary + full transcript
POST   /api/agent-runs/:id/cancel
GET    /api/features/:r/:s/tickets/:t/briefing              what an agent would be handed
POST   /api/features/:r/:s/tickets/:t/launch-agent          { agentId, launchedBy, acknowledged }

GET    /api/repositories                                    tracked checkouts
POST   /api/repositories                                    { absolutePath, label? }
POST   /api/repositories/discover                           { root, maxDepth }
POST   /api/repositories/rescan
GET    /api/repositories/tooling                            controller version + ruleset

GET    /api/portfolio                                       rows + summary
GET    /api/inbox            ?repositoryId&severity         what is waiting on a human
GET    /api/ready-queue      ?repositoryId&layer&type&maxHours
GET    /api/audit            ?repositoryId&slug&limit

GET    /api/features/:repositoryId/:slug                    everything one page needs
GET    /api/features/:repositoryId/:slug/document?name=
POST   /api/features/:repositoryId/:slug/gates/:gate/check  runs aidlc check, changes nothing
POST   /api/features/:repositoryId/:slug/gates/:gate/pass    { by }
POST   /api/features/:repositoryId/:slug/gates/:gate/reopen  { by, reason }
POST   /api/features/:repositoryId/:slug/tickets/:id/transition  { action, by, reason?, noReview? }
POST   /api/features/:repositoryId/:slug/regenerate         uow_graph.py --write
POST   /api/features/:repositoryId/:slug/validate
POST   /api/features/:repositoryId/:slug/lint-touches

GET    /api/maintenance/status
POST   /api/maintenance/refresh                             drop every cache
POST   /api/maintenance/sweep-gates                         check every next gate, in background
```

`RefusedError` maps to 409, not 400, on purpose: the request was well-formed and the caller
was entitled to make it — the *state* forbids it. That distinction is the entire content of
a gate.

## Realtime

`PlanWatcherService` watches each repository's `.ai/features/` with chokidar, debounced,
and emits `plan.changed` over socket.io. These files have three authors — a person in an
editor, a planning agent, and the console itself — so without the push a tab shows a ticket
as `todo` minutes after an agent finished it.

`AgentEventBridge` puts agent output on the same socket. It is a separate class rather than
a socket call inside the launcher so the `agents` context keeps no dependency on the
transport: it publishes to an in-process listener and does not know a browser is watching.
