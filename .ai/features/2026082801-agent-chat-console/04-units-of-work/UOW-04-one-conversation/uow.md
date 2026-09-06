---
id: UOW-04
slug: one-conversation
title: A ticket's agent work reads as one conversation
demoable: true
duration: 2d
depends_on: [UOW-02, UOW-03]
requirements: [US-02]
verifies: [AC-04, AC-05]
risk: medium
status: todo
rollback: the thread is a new component behind the existing drawer; restoring the previous drawer body leaves the API untouched
---

# UOW-04 — A ticket's agent work reads as one conversation

UOW-02 made replying possible over HTTP. This is where it becomes something a person would
use: the drawer's terminal pane becomes a conversation of runs, with the reply box at the
bottom and the properties rail beside it.

## Demo script
1. Open a ticket that has two runs and a reply between them
2. All three appear in order, each naming the agent and the human it is attributed to
3. Launch a fresh run from the thread and watch tool activity appear without a refresh
4. When it finishes, the "currently doing" line disappears rather than freezing on the last
   tool it touched
5. Type a correction in the reply box and send it — a new entry appears in the same thread
6. Open a ticket whose agent cannot resume: the reply box is disabled and says why, and a
   fresh launch is offered instead

## In scope
- Thread query and reply mutation on the web data layer
- The thread component and the reply composer
- Live activity streaming into the thread

## Not in scope
- The properties rail's pull-request panel (A-01, out of scope for this feature)
- Editing or deleting a message — a reply is a run, and runs are not edited

## Risks
| Risk | Mitigation |
|---|---|
| A finished run showing a stale "currently doing" line | `AgentRun.currentActivity` already returns null once terminal; T-04-04 asserts the UI honours it |
| The reply box appearing enabled on an agent that cannot resume | `canReply` and `cannotReplyReason` are resolved server-side in `thread()`; the UI never re-derives the rule |

## Definition of done
- [x] AC-04 and AC-05 pass
- [x] Runs and replies interleave by `createdAt`, each with its attribution
- [x] Live activity reaches the thread over the existing socket, with no polling added
- [x] The reply box states its reason whenever it is disabled
- [x] Demoed and accepted at gate G4
