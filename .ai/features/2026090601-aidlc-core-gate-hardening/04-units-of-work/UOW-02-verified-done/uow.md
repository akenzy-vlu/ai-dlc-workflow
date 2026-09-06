---
id: UOW-02
slug: verified-done
title: A ticket cannot reach done without a passing recorded run
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-06, AC-07, AC-09, AC-10]
risk: high
status: todo
rollback: delete the `evidence:` block from the target repo's `.ai/aidlc.yaml` — every code
  path added here is inert without it, so the controller returns to checkbox-only behaviour
  with no code change
---

# UOW-02 — A ticket cannot reach done without a passing recorded run

## Demo script

1. In a scratch repo with no `evidence:` block, `submit` a ticket — it moves to review as
   it does today, printing one line saying verification is not configured. Nothing ran.
2. Add an `evidence:` block whose command is `sh -c 'exit 0'` and give the ticket a
   `tests:` entry.
3. `submit` again on a second ticket — the command runs, the ticket moves to review, and
   `aidlc evidence T-02-02` shows one record: command, `exit 0`, a digest and a duration.
4. Point the command at `sh -c 'echo boom; exit 1'` and `submit` a third ticket —
   **refused**, exit 1. `aidlc evidence` shows the failing run *and its output tail*, which
   is the defect report.
5. `cat` that ticket: still `in_progress`. A failed verification does not move a ticket.
6. Point the command at a binary that does not exist — refused, and the record shows a
   failure to start rather than a pass.
7. Point it at `sh -c 'head -c 200000 /dev/urandom | base64; exit 0'` — the run is recorded,
   and `wc -c` on `history.jsonl` shows the record bounded by `output_ceiling`, with a
   digest covering the whole output.
8. Point it at `sh -c 'sleep 30'` with `timeout: 2` — refused, recorded as a timeout.

## In scope

- Reading the `evidence:` block through the existing mini-parser, one nested level deep.
- `scripts/evidence.py`: run a command under a timeout, capture exit code, digest the full
  output, retain a bounded tail. It decides nothing about gates.
- The evidence record itself, `HISTORY_KEYS` extended so runs cannot collide, and
  `aidlc evidence <ticket>`.
- Wiring it into `submit`, including the unconfigured path that must stay silent.

## Not in scope

- What G4 does with the records (UOW-03) — this slice records, it does not gate.
- `ai-dlc-verify` continues writing checkboxes; it is not retrofitted here.

## Risks

| Risk | Mitigation |
| --- | --- |
| A repo's suite is slow and `submit` becomes painful | `timeout` is required config, and T-02-02 treats a timeout as a failed run rather than hanging |
| Secrets printed by a failing test land in a committed trail | Bounded tail plus digest (A-07); T-02-02 asserts the ceiling and the runbook warns about it |
| The mini-parser drifts toward being a real YAML parser | T-02-01 handles exactly one nested level and states the limit in the code |

## Definition of done

- [x] AC-05, AC-06, AC-07, AC-09 and AC-10 all demonstrated on a scratch feature
- [x] A repo with no `evidence:` block behaves byte-identically to today
- [x] No import outside the standard library anywhere in `skills/ai-dlc-core/scripts/`
- [x] A failing run is recorded, not swallowed
- [x] `python3 -m py_compile` clean on every touched script
- [x] Demoed and accepted at gate G4
