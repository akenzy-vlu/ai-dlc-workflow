---
id: UOW-02
slug: reply-to-a-run
title: A person can reply to a finished run and the agent continues
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-01, US-04]
verifies: [AC-01, AC-02, AC-03, AC-08, AC-09]
risk: high
status: todo
rollback: the reply endpoint is additive; removing the route disables chat and leaves launching untouched
---

# UOW-02 — A person can reply to a finished run and the agent continues

The slice the feature exists for. A reply is stored as the `promptPreview` of a new run
linked by `parentRunId`, and that run is spawned with `--resume <sessionId>` instead of the
full brief (ADR-02). Nothing here transitions a ticket (ADR-05).

## Demo script
1. Launch Claude Code against a ready ticket and let it finish
2. `POST /api/agent-runs/<id>/reply` with a correction — "the test you added asserts the
   wrong error type; use SeatUnavailableFailure"
3. Watch the new run's argv: `-r <same session id> -p`, and its prompt: the correction
   alone, with no ticket brief in it
4. When it finishes, its telemetry reports the same session id as the run it answered
5. Reply again while that run is still going — refused, with the same conflict message a
   second `launch` on the ticket would give
6. Reply to a run from an agent with no declared resume invocation — refused, and the
   reason names the agent
7. Check the repo: `git status` on the target's `.ai/` is clean, and `aidlc audit` shows no
   entry for any of the replies

## In scope
- `AgentDefinition.resumeArgs` and the `{{session}}` substitution
- `parentRunId` on the run, in both store drivers, with one appended migration step
- `AgentLauncherService.reply()` and the two HTTP routes
- The refusal matrix, and the tests that prove chat cannot move a gate

## Not in scope
- Any UI (UOW-04) — this slice is demoed over HTTP
- Holding stdin open to interrupt a running agent (ADR-01)

## Risks
| Risk | Mitigation |
|---|---|
| A wrong resume flag opens an interactive session that hangs behind a pipe until the timeout | `resumeArgs` defaults to `null` and only `claude`'s invocation is declared (ADR-03, A-04) |
| A resumed run's hand-off re-submits a ticket already in review | `ALLOWED_FROM` permits review → review, so it is a no-op transition, not a refusal — asserted in T-02-08 |
| A session the CLI no longer knows | The run fails with the CLI's own stderr preserved; the console never silently relaunches without `--resume` |

## Definition of done
- [x] AC-01, AC-02, AC-03, AC-08 and AC-09 pass
- [x] A reply's prompt contains the reply text and nothing else
- [x] Every refusal in the error taxonomy returns 409 with the stated reason
- [x] No code path from a reply to a ticket transition, and none to a write under `.ai/`
- [x] The appended migration step runs clean on an existing database
- [x] Demoed and accepted at gate G4
