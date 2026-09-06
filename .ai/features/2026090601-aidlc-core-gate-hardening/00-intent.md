---
feature: aidlc-core-gate-hardening
slug: 2026090601-aidlc-core-gate-hardening
owner: Akenzy
created: 2026-09-06
status: draft
---

# Intent — AI-DLC core gate hardening

## Problem

`ai-dlc-core`'s founding claim is that a gate written as prose gets skipped, so gates are a
program instead. G0–G3 honour that: they parse frontmatter, run Kahn's algorithm on the
ticket graph, refuse an unsigned architecture map. G4 does not. It reduces to two prose
rules the controller never enforces, plus a third state it cannot even express.

**The reviewer separation is prose.** `SKILL.md` states "an implementer cannot accept its
own work: `submit` and `accept` are separate commands requiring separate names".
`_transition` (`skills/ai-dlc-core/scripts/aidlc.py:961`) checks only that the ticket sits
in `review`; `args.by` is never compared against whoever submitted. `submit --by claude`
followed by `accept --by claude` succeeds today. The data needed to refuse it is already
written — `submit` appends `{"action": "ticket review", "by": ..., "ticket": ...}` to
`history.jsonl` — and is never read back.

**The done-when checklist is self-attested end to end.** `submit` refuses while `- [ ]`
boxes are unticked (`aidlc.py:1000`) and `check_g4` counts the same boxes
(`aidlc.py:696`), but the actor who ticks them is the actor being gated. Nothing anywhere
requires that a test exists, that it ran, or that it passed. A feature can reach G5 —
"assumptions resolved, ADRs settled, graph valid" — on a codebase whose suite is red,
because no gate ever executes anything. The rigour of G0–G3 is therefore optional in
practice: the cheapest path through G4 is to type `x`.

**`blocked` is unreachable through the controller.** It is a valid status
(`uow_graph.py:40`) and a legal source state for `in_progress` (`ALLOWED_FROM`,
`aidlc.py:953`), but no subcommand sets it (`main()`, `aidlc.py:1240`). A ticket waiting on
an external dependency has to be hand-edited — the exact move `SKILL.md` calls "the one
move that makes this whole apparatus theatre" — and the wait leaves no trace in the trail.

**The trail is a receipt, not a read model.** `history.jsonl` already carries an actor and
a microsecond timestamp for every transition, and `cmd_audit` (`aidlc.py:1216`) prints them
as a list. Nothing folds them. So cycle time, time-in-review, time-blocked, aging
work-in-progress and actual-versus-estimate are all derivable today from data already on
disk, and none of them can be answered. `SKILL.md` claims "review lag shows up as stalled
parallelism rather than as invisible debt" — that is only true if a human happens to
notice `aidlc ready` going quiet. The 4h ticket ceiling is likewise enforced against a
guess that is never once compared to what actually happened, so estimates never calibrate.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Solo dev driving agents | Agent implements, ticks its own boxes, and `accept`s under a human's name; nothing verifies the code works | `submit` runs the ticket's verification command and records the result; `accept` is refused to the submitting actor |
| Reviewer at G4 | Reads a markdown checklist and trusts it | Reads a recorded run — command, exit code, output digest, timestamp — attached to the ticket in the trail |
| Portfolio owner running `project_registry.py --report` | Sees gate, ticket counts, effort, blocking assumptions; no time dimension at all | Sees cycle time, time in review, time blocked, aging work-in-progress and estimate bias per repo, with nothing new typed by hand |

## Success signal

On a scratch feature, **3 of 3 known G4 bypasses are refused** — same-actor
`submit`→`accept`, reaching `done` while the ticket's verification command exits non-zero,
and entering `blocked` without a trail entry — and **`aidlc flow` answers cycle time, time
in review and estimate bias for all 3 plans already closed in this repo, with 0 fields
entered by hand.** Both halves are checkable in one sitting against artifacts that exist
before this feature starts.

## Out of scope

- **The value axis (M3 from the review).** `priority:` on the UoW, `uow_graph --cut must`,
  priority-sorted `ready`, `aidlc abandon`. Independently shippable and it changes what a
  plan *says*, not whether the plan is true; deferred to its own feature.
- **Strengthening G1 (M4 from the review).** Well-formed Given/When/Then, one AC per user
  story, unique AC ids, validating a ticket's `assumptions:` against the register. Cheap,
  but it is elaboration rigour rather than execution truth, and mixing it in would blur
  what this feature's RULESET bump means.
- **Every change to `apps/`.** The console must keep building and its suite must keep
  passing — that is a definition-of-done item here — but no console parser gains a field
  and no screen gains a control. Surfacing evidence and flow data in the UI is a follow-up
  feature.
- **Retrofitting `ai-dlc-verify`.** Core defines and owns the evidence-record contract;
  `verify.py` keeps appending checkboxes exactly as it does today and is migrated onto the
  contract later. Spanning both packages would drag the Playwright rung into this slice.
- **A forced migration of ruleset-4 plans.** Existing plans keep validating under the rules
  they were authored against and print a migration hint. No flag day, no `aidlc migrate`.
- **Any change to how G0, G1, G2, G3 or G5 decide.** Their preconditions are unchanged; G5
  gains nothing beyond what a passing G4 already implies.

## Constraints

| Kind | Detail |
| --- | --- |
| Runtime | Stdlib-only Python 3 under `skills/ai-dlc-core/scripts/`. No new dependency may enter core — that property is what lets a machine with no test runner still validate someone else's evidence |
| No test suite | `skills/` has no automated tests. Validation is `python3 -m py_compile` plus an end-to-end run against a scratch `.ai/features/<slug>` directory, per `docs/PILOT-RUNBOOK.md` |
| Live tooling | The `aidlc` alias runs `~/.claude/skills/ai-dlc-core` — a copy, byte-identical to this working tree today but not a symlink. This feature is planned and driven by the very controller it edits; the working tree may not be installed over the running copy mid-construction |
| Blast radius | Core is installed globally and drives plans in erp2, erp3 and jack-erp as well as this repo. A change that refuses a previously-valid plan is a breaking change to repos not represented in this review |
| Versioning | Evidence records change what G4 accepts, so `RULESET` goes 4 → 5. Ruleset-4 plans must keep passing under ruleset-4 rules (warn-only), which means core carries both rule sets |
| Console coupling | `apps/api/.../filesystem-feature-plan.reader.ts` deliberately mirrors `REQUIRED_INTENT_SECTIONS` and `assumption_rows`; `pnpm test` and `pnpm typecheck` must stay green even though no console file is edited |
| Trust surface | Executing a command named in a repo's `.ai/aidlc.yaml` is new behaviour for a controller that has never run anything but `uow_graph.py`. The mechanism is a G2 decision, but the constraint is fixed: it must be opt-in per repo and absent config must degrade to today's behaviour, never to a refusal |

## Existing surface touched

- **Reused, not rewritten:** `history.jsonl` and its `merge=union` contract, `stamp_entry`
  / `entry_id` / `read_history` / `fold_gate`, `feature_lock`, `write_atomic`,
  `parse_frontmatter_files`'s import of `uow_graph.load_plan`, and
  `find_config` / `check_ruleset` in `uow_graph.py`.
- **Extended:** `ALLOWED_FROM` and `_transition` in `aidlc.py`; `main()`'s subparsers;
  `check_g4`; `RULESET` and `check_ruleset` in `uow_graph.py`; the `feature`/`ticket`
  tables and `report()` in `project_registry.py`.
- **Adjacent, deliberately untouched:** `discover_generic.py`, every `check_gN` other than
  `check_g4`, and all of `skills/ai-dlc-verify/`.
- **Entry points:** the `aidlc` and `uowg` shell aliases; `AIDLC_CORE_PATH` in
  `apps/api/src/config/aidlc.config.ts`, which resolves the installed copy.
