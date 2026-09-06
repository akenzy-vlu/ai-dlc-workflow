---
id: UOW-01
slug: reviewer-separation
title: A ticket cannot be accepted by the actor that submitted it
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: low
status: todo
rollback: revert the self-acceptance branch in `_transition`; the helpers it calls are pure
  and inert on their own, so removing the branch returns the controller to today's behaviour
---

# UOW-01 — A ticket cannot be accepted by the actor that submitted it

## Demo script

1. In a scratch repo, scaffold a feature and drive it to G3 with one ticket.
2. Run `submit T-01-01 --by claude` — the ticket moves to review.
3. Run `accept T-01-01 --by claude` — **refused**, exit 1, and the message names `claude`
   as the submitter and says a second actor must accept.
4. `cat` the ticket file: `status: review`, untouched by the refusal.
5. Run `accept T-01-01 --by "  CLAUDE "` — refused too; case and surrounding whitespace do
   not make a new actor.
6. Run `accept T-01-01 --by akenzy` — accepted; the ticket moves to done.
7. `aidlc audit` shows the submit under `claude` and the acceptance under `akenzy`.
8. On a second ticket, `start` then `done --by claude --no-review` — still allowed, and the
   trail records it as a review bypass rather than a plain acceptance.

## In scope

- Actor normalisation and a trail lookup for a ticket's last `ticket review` event.
- The refusal branch in `_transition`, with a message that names the submitter.
- Keeping `--no-review` working and distinctly labelled.
- Replacing the prose claim in `SKILL.md` and `methodology.md` with the enforced rule.

## Not in scope

- Verifying that the work is correct (UOW-02) — this slice only decides *who* may accept.
- Any identity stronger than a normalised string (ADR-04).

## Risks

| Risk | Mitigation |
| --- | --- |
| A solo user is locked out of their own workflow | `--no-review` is untouched and covered by AC-03; T-01-03 exists only to prove it |
| An old plan's trail has no `ticket review` event for a ticket already in review | Absent a submit event there is nobody to conflict with, so the accept proceeds — asserted in T-01-02 |

## Definition of done

- [x] AC-01, AC-02, AC-03 and AC-04 all demonstrated on a scratch feature
- [x] `python3 -m py_compile` clean on every touched script
- [x] A refused accept leaves the ticket file byte-identical
- [x] `SKILL.md` no longer states the rule as prose alone
- [x] Demoed and accepted at gate G4
