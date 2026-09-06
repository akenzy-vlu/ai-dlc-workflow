---
feature: aidlc-core-gate-hardening
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| ---- | ---------- | ---------- | -------- | --------------------- | ------ | ---------- |
| A-01 | Compatibility must hold **per plan**, not per repo: a plan authored under ruleset 4 keeps validating under ruleset-4 rules after this repo's pin moves to 5 | high | yes | Forces a per-feature ruleset pin written at `init` plus conditional G4 logic. If repo-level were acceptable, UOW-02 loses two tickets and becomes a version bump | confirmed | Confirmed by Akenzy, 2026-09-06 — chose "warn-only for ruleset-4 plans" in the Phase 0 question round |
| A-02 | Executing a repo-configured verification command is acceptable behaviour for the controller, provided it is opt-in per repo and absent config degrades to today's behaviour | medium | yes | The entire evidence mechanism. If unacceptable, core only ingests evidence produced by an external run and UOW-02 is re-cut around a report-file reader | confirmed | Confirmed by Akenzy, 2026-09-06 — chose M1 with core owning the contract; the execute-vs-ingest mechanism is settled as ADR-01 at G2, and the opt-in constraint is recorded in `00-intent.md` |
| A-03 | The three plans already closed in this repo carry enough trail data to compute flow metrics without any backfill | high | no | The second half of the success signal. If false it weakens to "new plans only" and UOW-03's demo cannot use real data | confirmed | Verified 2026-09-06 — 104 events across the 3 plans, every one carrying `ts`, `by` and `action` |
| A-04 | `skills/` work maps onto this repo's existing layer vocabulary — validation rules → `domain`, controller and orchestration → `application`, read model and file I/O → `infrastructure`, CLI surface and reference docs → `interface`, scratch-run validation → `test` | medium | no | Every ticket's `layer:` line. A one-line edit each, and `uow_graph.py` errors loudly rather than failing silently | pending | — |
| A-05 | A ticket's verification command is derivable from the ticket (a `tests:` list resolved against a repo-level template) rather than hand-written per ticket | medium | no | Ticket authoring burden and `references/templates.md`. If wrong, every ticket grows a hand-written command line | pending | — |
| A-06 | Evidence records belong in `history.jsonl` beside gate and ticket events, not in a separate file | medium | no | `merge=union`, `read_history` dedupe and `reconcile` already cover that file. A separate file needs its own `.gitattributes` rule and reconcile path | pending | — |
| A-07 | Command output is recorded as a digest plus a bounded tail, never in full | high | no | Trail size and secret exposure. Full output makes `history.jsonl` unbounded and can capture credentials printed by a failing test | pending | — |
| A-08 | Exit code is a sufficient verdict, so no structured result format (JUnit XML, JSON report) needs parsing | high | no | Widens the contract if wrong. Stdlib has an XML parser so no dependency enters either way, but the config schema grows a result-format key | pending | — |
| A-09 | `skills/` stays without an automated test suite; validation remains `py_compile` plus an end-to-end scratch run, per `docs/PILOT-RUNBOOK.md` | medium | no | Adding subprocess execution and actor comparison to a controller with zero tests is the riskiest part of this feature. If a suite is expected, one UoW is added and the definition-of-done changes | pending | — |
| A-10 | Construction edits the working tree only; `~/.claude/skills/ai-dlc-core` is installed over **after** G4, so the controller driving this plan stays stable while its own source changes | high | no | If the installed copy were updated mid-construction, a half-finished change would start gating this very feature's tickets | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| ---- | --------------- | --------------------- | ----------- |
| A-11 | `~/.claude/skills/ai-dlc-core` is a symlink into this working tree, so edits take effect immediately | It is a plain directory copy — byte-identical to the working tree today, but independent (`readlink -f` resolves to itself; `diff -rq` differs only by `.DS_Store` and `__pycache__`) | A-10 becomes stateable at all, and the demo script for every UoW must run against the **working tree** path explicitly rather than the `aidlc` alias, which resolves to the installed copy |
| A-12 | `check_ruleset` already gates on a mismatched pin, so "old plans keep working" is existing behaviour | It only returns warning strings, and the pin it reads is repo-level in `.ai/aidlc.yaml` — there is no per-plan pin and no conditional-rule machinery anywhere | A-01 turns blocking, and UOW-02 gains the per-feature pin and the ruleset-conditional G4 branch as real work rather than a version-number edit |
