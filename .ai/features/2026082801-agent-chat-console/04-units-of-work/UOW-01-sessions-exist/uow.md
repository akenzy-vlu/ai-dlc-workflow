---
id: UOW-01
slug: sessions-exist
title: A launched agent reports a session id
demoable: true
duration: 1d
depends_on: []
requirements: [US-05]
verifies: [AC-10]
risk: medium
status: todo
rollback: revert the one-line args change in path-agent.catalog.ts; the translator already returns null for non-stream-json, so every run goes back to plain prose
---

# UOW-01 — A launched agent reports a session id

Nothing else in this feature can work without a `sessionId`, and today the built-in
`claude` entry is `args: ['-p']` — which produces prose, not stream-json, and therefore no
session. This slice is first because it is the precondition for the other three, and it
stands alone because it is the only change here that alters behaviour for runs that have
nothing to do with chat.

## Demo script
1. Open the console with no `agents.json` override on the machine
2. Launch Claude Code against any ready ticket
3. Watch the transcript: readable prose and tool lines, not raw JSON
4. When the run finishes, the run view shows its session id and a "Resume available" badge
5. Launch the same agent from a machine whose `agents.json` overrides `claude` — the
   override still wins, and the badge is absent because no session was reported

## In scope
- The built-in `claude` invocation
- The web-side type surface for a run's `telemetry` and `isResumable`, which the API
  already returns and the client currently drops on the floor

## Not in scope
- Replying to a run (UOW-02)
- Token counts inside telemetry (UOW-03)

## Risks
| Risk | Mitigation |
|---|---|
| Changing the built-in changes transcript rendering for every existing user (A-06) | Shipped as its own slice so it reverts alone; T-01-02 pins the rendering with a recorded transcript |
| A CLI version whose stream-json shape differs | The translator already returns `null` on anything it cannot parse, which falls back to printing the line verbatim |

## Definition of done
- [x] AC-10 passes
- [x] A run launched with no override reports a sessionId
- [x] The transcript is prose and tool lines, never raw JSON
- [x] An `agents.json` override still takes precedence over the built-in
- [x] Demoed and accepted at gate G4
