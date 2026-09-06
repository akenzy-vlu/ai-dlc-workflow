# Intent — agent-chat-console

## Problem

The console can hand a ticket to an agent and stream what the agent does, but the
conversation is one-shot. `streaming-process.ts` writes the prompt to stdin and closes it
immediately; `claude -p` runs once and exits. When the work comes back wrong or
incomplete, the only recourse is a fresh launch that re-tells the agent everything it
already worked out — which is the exact re-explanation cost `AgentDefinition`'s own doc
comment says the launcher exists to remove.

There is also nowhere on a ticket to say anything *to* the agent. The run drawer is a
read-only terminal. `AgentRun.isResumable` and `AgentTelemetry.sessionId` were built for
this and are exposed by the API, but nothing calls them.

Separately, the run view can report what a run cost in dollars and turns but not in
tokens, because the translator drops the `usage` block of the stream-json `result` event.

## Success signal

- From a ticket, a person replies to a finished run and the agent continues **its own
  session** rather than a new one — observable as the same `sessionId` across runs, and as
  a follow-up prompt that does not restate the ticket brief.
- A ticket shows its runs as one thread with the replies interleaved, not as a list of
  disconnected drawers.
- The run view answers "what did this cost" in tokens: input, output, cache read, cache
  write — alongside the dollar figure it already shows.
- An agent that cannot resume (no `sessionId` reported, or a CLI with no verified resume
  invocation) says so plainly and offers a fresh launch instead. It never silently starts
  a new session while presenting it as a continuation.
- Nothing added here can accept a ticket. Chat steers an agent; `submit` → `accept` stays
  the only path to done, and stays human.

## Out of scope

- **Pull-request integration** — the "Pull requests" panel of the reference screenshot.
  Creating, linking or summarising a PR is a separate integration surface (git remotes,
  GitHub auth, webhooks) with no dependency on chat. See assumption A-01.
- **Mid-run interruption** — holding stdin open with `--input-format stream-json` so a
  person can chen ngang a running agent. Turn-based resume first; the interactive session
  earns its place only if turn-based proves insufficient. See assumption A-02.
- **Multi-agent threads.** One thread continues one agent's session.
- **Any write to `.ai/`.** Chat is console state, not plan state.
- **Container support for chat.** Agent launching already does not work in the API image
  (no agent CLI on `PATH`); chat inherits that limitation rather than fixing it.

## Constraints

- **The console never writes plan state.** Threads and messages go to `AGENT_RUN_STORE` —
  which means both the `file` and the `postgres` driver — and never into a feature's
  `.ai/` directory. The durable record of who changed a ticket stays `history.jsonl`,
  written only by the controller.
- **Resume depends on a flag the built-in entry does not set.** `sessionId` only arrives
  under `--output-format stream-json`, and `path-agent.catalog.ts` ships `claude` as
  `args: ['-p']`. Either the built-in changes or resume is dark for anyone who has not
  overridden `agents.json`.
- **Resume is a per-agent capability, never an assumption.** `codex`, `cursor-agent` and
  `copilot` have no verified non-interactive resume invocation. Per the catalog's own
  warning, a wrong flag here does not error — it opens an interactive session that hangs
  forever behind a pipe.
- **Attribution is doubled.** A run records the human and the agent both; a chat message
  must do the same.
- **A ticket already refuses concurrent runs.** `launch` throws on an active run for the
  same ticket. Replying to a thread must respect the same rule rather than route around it.
