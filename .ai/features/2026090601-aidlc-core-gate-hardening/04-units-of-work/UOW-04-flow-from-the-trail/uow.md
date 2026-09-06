---
id: UOW-04
slug: flow-from-the-trail
title: Waiting is recorded, and the trail answers how the work actually flowed
demoable: true
duration: 1.5d
depends_on: [UOW-03]
requirements: [US-04, US-05]
verifies: [AC-14, AC-15, AC-16, AC-17]
risk: medium
status: todo
rollback: the two new subcommands and `scripts/flow.py` are additive and read-only; deleting
  them removes the reports and changes no gate, and `blocked` returns to being a status only
  reachable by hand
---

# UOW-04 — Waiting is recorded, and the trail answers how the work actually flowed

## Demo script

1. In a scratch feature past G3, `start T-01-02`, then
   `block T-01-02 --by akenzy --reason "waiting on the upstream contract"`.
2. `aidlc ready` no longer offers T-01-02; `aidlc status` shows it as blocked.
3. `aidlc audit` shows the block, its reason, and the state it interrupted.
4. `unblock T-01-02 --by akenzy` — it returns to `in_progress`, not to `todo`; the state it
   was blocked from is restored rather than guessed.
5. `unblock` a ticket that was never blocked — refused; there is nothing to restore.
6. Run `aidlc flow` against **this** repo's `2026082902-skill-file-viewer`, closed weeks
   ago: it prints per-ticket cycle time, time in review and time blocked, plus estimate
   bias for the feature — from a trail written before this feature existed, with nothing
   entered by hand.
7. Run it against the other two closed plans — same, no backfill.
8. `aidlc flow --aging-hours 1` on a feature with a ticket left in progress — it is listed
   as aging.
9. `project_registry.py --db /tmp/plans.db --scan <repo>:ai-dlc --report` — the report now
   carries a Flow section and a Stuck section across every scanned repo.

## In scope

- `block` / `unblock`, with the interrupted state carried on the block event.
- `scripts/flow.py`: the fold that turns trail events into cycle time, review lag, blocked
  spans, estimate bias and aging.
- `aidlc flow` and one extra line in `aidlc status`.
- The same three numbers projected into `project_registry.py`'s disposable tables and its
  report.

## Not in scope

- Any stored metric (ADR-05) — everything is computed per invocation.
- Forecasting, capacity or assignees. This slice measures what happened, it does not plan.

## Risks

| Risk | Mitigation |
| --- | --- |
| A trail with an unpaired block, or a ticket accepted with no start, divides by nothing | T-04-02 treats an unpairable span as unknown and reports it as such, never as zero |
| Two implementations of the same metric drift | `project_registry.py` imports the fold from `flow.py` rather than recomputing, the way `aidlc.py` already imports `uow_graph` |
| Flow numbers get read as a performance measure of a person | The report is per ticket and per feature, never per actor; stated where the command is documented |

## Definition of done

- [x] AC-14, AC-15, AC-16 and AC-17 all demonstrated
- [x] All three plans already closed in this repo yield flow numbers with no backfill
- [x] `unblock` restores the interrupted state, proven from `review` as well as `in_progress`
- [x] No metric is written into `.aidlc-state.yaml`
- [x] `python3 -m py_compile` clean on every touched script
- [x] Demoed and accepted at gate G4
