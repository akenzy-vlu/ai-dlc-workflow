---
id: UOW-03
slug: old-plans-keep-working
title: Plans authored under the old rules keep passing after the bump
demoable: true
duration: 1.5d
depends_on: [UOW-02]
requirements: [US-03]
verifies: [AC-08, AC-11, AC-12, AC-13]
risk: high
status: todo
rollback: revert `RULESET` to 4; the per-plan stamp becomes an unread field and `check_g4`
  falls back to the ruleset-4 branch for every plan, which is today's behaviour
---

# UOW-03 — Plans authored under the old rules keep passing after the bump

## Demo script

1. Run `uowg --version` — it reports ruleset 5.
2. Against **this** repo, run `check G4` on `2026082902-skill-file-viewer`, a plan closed
   under ruleset 4 with no evidence records anywhere. It still evaluates, and the verdict
   is unchanged from before the bump; a migration hint names the ruleset it was authored
   under.
3. Repeat for `2026082801-agent-chat-console` and `2026082901-ticket-detail-drawer` — all
   three unchanged.
4. `aidlc init demo-ruleset-five` in a scratch repo; `cat .aidlc-state.yaml` shows the
   stamp `ruleset: 5`.
5. Drive that scratch plan to G3 with one ticket, `submit` and `accept` it *without*
   configuring `evidence:` — G4 passes, because the repo did not opt in.
6. Configure `evidence:`, add a second ticket, mark it done without a run, and
   `check G4` — **fails**, naming exactly that ticket.
7. Run `pnpm test` and `pnpm typecheck` at the repo root — both green, with no file under
   `apps/` edited in this feature.

## In scope

- Stamping the tool's `RULESET` into `.aidlc-state.yaml` at `init`; an absent stamp reads
  as 4.
- The ruleset-conditional branch in `check_g4`, and the migration hint.
- The `RULESET` 4 → 5 bump itself, and a regression pass over the three closed plans.
- Confirming the console still builds and tests green.

## Not in scope

- Any `aidlc migrate` command. The compatibility answer is warn-only, not a flag day.
- Changing what G0, G1, G2, G3 or G5 decide.

## Risks

| Risk | Mitigation |
| --- | --- |
| Carrying two rule sets rots into untested dead code | T-03-03's regression run exercises the ruleset-4 branch against three real plans on every future change |
| Plans in erp2/erp3/jack-erp are not represented in the regression | The absent-stamp default is the *safe* one, and step 2 proves the default path; the runbook records the check to run in each repo after installing |
| The console's parsers break on a new state-file key | T-03-04 runs `pnpm test` and `pnpm typecheck`; the key is additive and the reader ignores unknown keys |

## Definition of done

- [x] AC-08, AC-11, AC-12 and AC-13 all demonstrated
- [x] All three closed plans in this repo produce the same verdict as before the bump
- [x] `pnpm test` and `pnpm typecheck` green, with zero files edited under `apps/`
- [x] `docs/PILOT-RUNBOOK.md` records the post-install check for a target repo
- [x] Demoed and accepted at gate G4
