---
id: UOW-03
slug: token-cost
title: A run reports what it cost in tokens
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-06, AC-07]
risk: low
status: todo
rollback: the four telemetry fields stay null and the panel renders as unavailable; nothing else reads them
---

# UOW-03 — A run reports what it cost in tokens

The console can already say a run cost `$0.31`. It cannot say why. The `usage` block of the
stream-json `result` event carries the four numbers that explain it, and the translator
currently drops them.

Rides on the existing `telemetry` blob, so there is no migration and no backfill (ADR-04).

## Demo script
1. Launch Claude Code against a ready ticket and let it finish
2. Open the run: input, output, cache read and cache write are each shown beside the dollar
   figure the drawer already had
3. Open a run recorded before this feature: the same four rows read "not reported", not "0"
4. Open a run from a CLI that emits no stream-json at all: same — not reported

## In scope
- `AgentTelemetry` gains four nullable counts
- The translator reads `usage` from the `result` event
- The run view shows them, and distinguishes absent from zero

## Not in scope
- Aggregating cost across runs, tickets or features
- Any budget, cap or warning threshold

## Risks
| Risk | Mitigation |
|---|---|
| A-05 is still pending — the `usage` block may not be shaped as expected | Read defensively and leave the fields null on anything unexpected. If A-05 is false the panel ships empty and nothing else in the feature moves |
| A number shown as 0 when it was never reported reads as a free run | Nullable throughout, and an explicit "not reported" in the UI — asserted in T-03-03 and T-03-04 |

## Definition of done
- [x] AC-06 and AC-07 pass
- [x] A `result` event with no `usage` leaves all four counts null
- [x] A run recorded before this change loads and reports them as unavailable
- [x] A-05 is resolved in the register, either way
- [x] Demoed and accepted at gate G4
