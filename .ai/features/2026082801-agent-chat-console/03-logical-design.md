# Logical design — agent-chat-console

## Approach

A reply is a run. That is the whole design.

Today a launch produces one `AgentRun` whose `promptPreview` is the brief it was given.
A reply produces another `AgentRun` whose `promptPreview` is the reply text and whose
argv carries `--resume <sessionId>` instead of the full brief. Two fields join them:
`parentRunId` on the child, and the `sessionId` both already carry in telemetry. The
"thread" the UI draws is `store.list({repositoryId, slug, ticketId})` sorted by
`createdAt` — a query, not a new aggregate.

This falls out of an observation about the existing code rather than a preference: the
text of a reply is *already* modelled. It is a prompt, and `AgentRun` already stores the
prompt it was launched with. Introducing a `ChatMessage` entity beside it would mean two
things that are the same thing, two stores to keep coherent, and a fourth `AGENT_*` port
with two drivers — for a field that exists.

What actually changes, in the order the UoWs will take it:

1. **`sessionId` has to exist.** It only arrives under `--output-format stream-json`, and
   the built-in `claude` entry is `args: ['-p']`. Without this step nothing else can work,
   so it goes first and stands alone — it is also the only step that changes behaviour for
   runs that have nothing to do with chat.
2. **The process layer learns to resume.** `AgentDefinition` grows a declared resume
   invocation; `argsFor` learns a `{{session}}` substitution. `startStreamingProcess` is
   untouched: a resumed run is still one prompt in, one process out, stdin closed.
3. **The launcher learns `reply`.** A second entry point beside `launch`, sharing its
   conflict rules and its hand-off, differing in what it puts in the prompt and what it
   puts in argv.
4. **The transcript gets token counts.** `usage` from the `result` event into
   `AgentTelemetry`, which is already a `JSONB` column and a free-form interface.
5. **The UI becomes a thread.** The run drawer's terminal pane becomes a conversation of
   runs, with the reply box at the bottom and a properties rail beside it.

The seam that keeps this honest is the one that already exists. `handOff` submits a clean
run for review and deliberately never accepts it. A reply changes nothing about that.

## Alternatives rejected

| Option | Why not |
|---|---|
| Hold stdin open (`--input-format stream-json`) for a live session | The real prize — chen ngang a running agent — but it rewrites the process layer rather than extending it: `StreamingProcessHandle` and `AgentProcessPort` both grow a `write()`, the wall-clock timeout has to become idle-based or it kills a conversation mid-sentence, and the socket needs an inbound path. `path-agent.catalog.ts` already documents the failure this invites: a wrong flag does not error, it hangs forever behind a pipe. Deferred, not discarded — see ADR-01 |
| A `ChatMessage` aggregate with its own port and drivers | Two representations of one prompt, kept coherent by hand. See Approach |
| A `chat_message` table joined to `agent_run` | The join is the thread ordering, which `agent_run_scope_idx` already indexes. A table whose only content is a string that already exists in `prompt_preview` |
| Store the thread in `.ai/` so it survives a console reinstall | Breaks the one rule the console hangs on. Chat is observation, not plan state; `history.jsonl` stays the durable record of what an agent *did* |
| Infer the resume flag per agent (`--resume` for everything) | The catalog's own warning. `codex`, `cursor-agent` and `copilot` each have a different answer and two of them are not installed here to test against |
| Re-send the full brief on every reply, ignoring `--resume` | Works with every CLI and needs no session at all — and reintroduces the exact re-explanation cost the launcher exists to remove. Kept only as the fallback when an agent declares no resume invocation |

## Contracts

**Domain**

```
AgentRunProps        + parentRunId: string | null
AgentRun             + get parentRunId, + get isReply
AgentTelemetry       + inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens
                       (all number | null — absent is not zero)
AgentDefinitionProps + resumeArgs: string[] | null   // null = cannot resume
AgentDefinition      + get canResume, + argsForResume(sessionId)
```

`argsFor` substitutes `{{prompt}}`; `argsForResume` substitutes `{{session}}` as well.
For `claude` the declared entry is
`['-p', '--output-format', 'stream-json', '--verbose']` and
`['-r', '{{session}}', '-p', '--output-format', 'stream-json', '--verbose']`.

**Ports**

`AgentProcessPort` is unchanged. `AgentRunStorePort` is unchanged — `list()` already takes
`{repositoryId, slug, ticketId}`, which is the thread query.

**HTTP**

```
POST /api/agent-runs/:id/reply     { message, repliedBy?, acknowledged }  -> { runId }
GET  /api/features/:repositoryId/:slug/tickets/:ticketId/thread           -> ThreadView
```

`ThreadView` is the existing run summaries in `createdAt` order, plus `canReply` and, when
false, `cannotReplyReason` — so the UI never has to re-derive the rule.

**Persistence**

Postgres: one appended migration step, `ALTER TABLE agent_run ADD COLUMN IF NOT EXISTS
parent_run_id TEXT`. Token counts need no migration — `telemetry` is already `JSONB`, and
`pg-agent-run.store.ts` reads with `SELECT *`. File driver: two optional fields on
`PersistedRun`, absent on every run written before this feature.

**Socket**

Unchanged. `agent.run` frames already carry the run id; the thread view subscribes to the
same stream and routes by `parentRunId`.

## Error taxonomy

| Condition | Where it is caught | What happens |
|---|---|---|
| Run has no `sessionId` | `reply`, before anything spawns | 409, `cannotReplyReason: "this run reported no session — the CLI was not run with --output-format stream-json"`. Reply box disabled, fresh launch offered |
| Agent declares no resume invocation (`resumeArgs: null`) | `reply` | 409, reason names the agent. Never falls back to a guessed flag |
| Another run is active on the ticket | `reply`, reusing `launch`'s check | 409, the same conflict message `launch` already returns |
| Session expired or unknown to the CLI | The child process, at runtime | Non-zero exit; run is `failed`; stderr is preserved verbatim in the transcript. The console does not retry, and does not silently relaunch without `--resume` — that would be a new conversation wearing a continuation's label |
| Ticket already `done` | `reply` | 409. A done ticket is not a place to keep talking |
| Ticket in `review` when the reply's run finishes clean | `handOff` | `submit` from `review` is permitted by `ALLOWED_FROM` (`review` → `review`), so this is a no-op transition, not a refusal |
| Ticket in `review` and someone wants the agent to keep working | Not handled here | The controller has no `review` → `in_progress` edge. Rejecting the ticket first (`review` → `todo`) is the intended path and stays a human action. The reply itself does not move the ticket |
| `result` event carries no `usage` | Translator | Counts stay `null`; the UI shows them unavailable, never zero |
| Reply posted to a run whose ticket has since been deleted from the plan | `resolve()` | 404, as `launch` already does |
| Agent CLI missing from `PATH` (containers) | Catalog | Unchanged: `available: false`, and `canReply` is false for the same reason. Degrades honestly, exactly as launching already does |

## ADRs

### ADR-01 — Resume turn by turn; do not hold stdin open
**Status:** accepted
**Context.** Chat could mean two different things: answering an agent that has stopped, or
interrupting one that is running. The second needs a process whose stdin stays open for
minutes, and `streaming-process.ts` closes stdin immediately by design.
**Decision.** v1 answers a stopped agent. `claude -r <session> -p` with the reply on stdin;
one process per turn; stdin still closes.
**Consequences.** The process layer is untouched, which means the wall-clock timeout, the
cancel path and the crash handling all keep working unexamined. The cost is that a person
cannot correct an agent mid-run — they wait for it to stop. `--input-format stream-json`
exists on this machine's `claude` (verified 2026-08-28), so the door stays open; the
prerequisite for walking through it is an idle-based timeout, which is a separate change.
Resolves A-02.

### ADR-02 — A reply is a run, not a message
**Status:** accepted
**Context.** A thread needs somewhere to live. A-07 asked whether `AGENT_RUN_STORE` is
enough.
**Decision.** It is. A reply is stored as the `promptPreview` of the run it starts, linked
by `parentRunId`. No new aggregate, no new port, no new table.
**Consequences.** Every reply carries a run's full apparatus — status, exit code,
transcript, telemetry, cancellation — which is what a reply actually produces. A reply that
starts no run (a note to oneself) has nowhere to go; if that is ever wanted it is a
different feature. The thread ordering is `createdAt`, already indexed by
`agent_run_scope_idx`. Resolves A-07.

### ADR-03 — Resume is a declared capability, never an inferred flag
**Status:** accepted
**Context.** Four CLIs are in the catalog and only `claude`'s resume invocation is
verified. A wrong flag does not error — it opens an interactive session that hangs behind a
pipe until the timeout kills it.
**Decision.** `resumeArgs` defaults to `null`. An agent without it reports `canReply:
false` with the reason shown, and the UI offers a fresh launch.
**Consequences.** `codex`, `cursor-agent` and `copilot` ship without chat until someone
verifies their invocation and adds it — to the built-in table or to `agents.json`. Users of
those CLIs see an honest limitation rather than a hung run. Resolves A-04.

### ADR-04 — Token counts ride the existing telemetry blob
**Status:** accepted
**Context.** US-03 wants four more numbers per run. A-05 is still pending on whether the
`result` event carries them.
**Decision.** Extend `AgentTelemetry` with four nullable fields and read them from
`usage` when present. `telemetry` is already `JSONB` in Postgres and a plain interface in
the file driver, so this needs no migration and no backfill.
**Consequences.** Runs recorded before this feature keep working and report the counts as
unavailable. If A-05 turns out false, the fields stay null everywhere and one panel is
empty — the failure is contained to US-03 and blocks nothing else, which is why A-05 is
non-blocking.

### ADR-05 — A reply never transitions the ticket
**Status:** accepted
**Context.** `launch` moves a `todo` ticket to `in_progress` through the controller before
spawning. The obvious symmetry would have `reply` do something similar.
**Decision.** It does not. A reply inherits whatever status the ticket has and requests no
transition of its own. The existing `handOff` still runs when the resumed run exits clean.
**Consequences.** AC-08 holds by construction rather than by care: there is no code path
from a chat message to a gate. A ticket in `review` that needs more agent work is rejected
by a human first — the controller has no `review` → `in_progress` edge, and inventing one
in the console would be the console legislating gate semantics, which it does not do.
