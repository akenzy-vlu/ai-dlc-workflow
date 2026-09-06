# Pilot runbook — one project

Every command below was run end-to-end against a clean repo before this was written, and the
output shown is what actually came back. The dry run found one real bug, which is fixed here
(see *Known issues found during validation* at the end).

**Time budget: 2–3 hours of planning for a feature of roughly a week.** That is the number to
judge against. If it saves half a day of rework, it paid for itself. If it does not, Part 4
tells you how to conclude that honestly rather than persevering out of sunk cost.

---

## Which project, and which feature

**Project:** one repo, not five. Pick the one where you will genuinely plan a feature in the
next two weeks.

**Feature: one that has not started.** This matters more than the repo choice. The value is
concentrated in the gates *before* code — assumptions, design, decomposition. Retrofit a
half-built feature and G1/G2 become paperwork describing decisions already made, you will
correctly conclude it is bureaucracy, and you will have tested the weakest thing the system does.

Pick something 3–6 days of work with at least one unknown — an unsettled API contract, an
unfamiliar library, a dependency on another team. A feature with no unknowns has nothing for
the assumption register to catch, and the register is the highest-value part.

---

## Part 1 — Setup, once

**Pick your profile first.** A profile supplies the repo's conventions, its definition-of-done,
and a discovery script that knows your framework. Only one exists today.

| Pilot repo                 | Profile                 | Discovery script                 |
| -------------------------- | ----------------------- | -------------------------------- |
| The sample Flutter monorepo | `profile-flutter` | the profile's `discover_repo.py` |
| Anything else              | none yet                | core's `discover_generic.py`     |

Running without a profile costs you two things: the stack definition-of-done, and a discovery
map that can enumerate your shared component library. Everything else — gates, decomposition,
the graph, sync — works unchanged. Write a profile later, once the stack has earned it
(`skills/ai-dlc-core/references/profile-contract.md`).

**Core and a profile install to different scopes. That split is deliberate, not a shortcut:**

| Package                                       | Install to                                               | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ai-dlc-core`                                 | `~/.claude/skills/` — **global**                         | You plan features in more than one repo, and `project_registry.py` explicitly aggregates plans *across* repos — the tooling that reads them has to be available everywhere, not scoped to one checkout.                                                                                                                                                                                                                                                                              |
| a stack profile, e.g. `profile-flutter` | `<repo>/.claude/skills/` — **project**, committed to git | A profile is scoped to the one repo it describes — its own `SKILL.md` names concrete path markers (`apps/sample_app`, `packages/sample_*`) that exist in that repo alone. Installing it globally makes it *visible* in every other project too, relying entirely on those markers to self-exclude when the repo is wrong. Installing it inside the repo means it only ever loads where it applies, and it reaches every teammate via `git clone` instead of a manual `cp` on every machine. |

```bash
# from a checkout of this repo (ai-dlc-**core** + the example profiles under examples/)
AIDLC_SRC=$(pwd)

# 1. core is cross-repo tooling — install it once, globally
cp -r "$AIDLC_SRC/skills/ai-dlc-core" ~/.claude/skills/

# 2. convenience alias (core only — same path on every machine)
alias aidlc='python3 ~/.claude/skills/ai-dlc-core/scripts/aidlc.py'
alias uowg='python3 ~/.claude/skills/ai-dlc-core/scripts/uow_graph.py'

# 3. verify
uowg --version          # → uow_graph 0.4.0 (ruleset 4)

# 4. a profile belongs to ONE repo — install it INSIDE that repo, not globally.
#    Run this from the pilot repo's root; commit .claude/skills/ so it ships with the code
#    it describes instead of living only on your machine.
cd <path-to-the-pilot-repo>
mkdir -p .claude/skills
cp -r "$AIDLC_SRC/examples/profile-flutter" .claude/skills/profile-flutter   # sample profile only
```

In the repo (still `<path-to-the-pilot-repo>`):

```bash
mkdir -p .ai
cat > .ai/aidlc.yaml <<'YAML'
profile: none              # or profile-flutter
ruleset: 4
layers: [domain, data, presentation, infra, test]
YAML

cat >> .gitignore <<'IGNORE'

# AI-DLC generated artifacts — derived from the tickets, regenerate with `uowg --write`
.ai/features/*/05-ticket-graph.md
.ai/features/*/06-traceability.md
.ai/features/*/registry.yaml
IGNORE
```

Set `layers` from what the repo actually uses, not from habit — the discovery step below
reports the layer directories it found, so run it first if you are unsure. A DDD service
usually wants `[domain, application, infra, api, test]`; a Flutter app
`[domain, data, presentation, infra, test]`.

---

## Part 2 — Walk the gates

### Phase 0a — Discovery (~15 min, most of it reading)

```bash
# no profile — works on any stack (core is global, same path on every repo)
python3 ~/.claude/skills/ai-dlc-core/scripts/discover_generic.py . -o .ai/architecture.md
python3 ~/.claude/skills/ai-dlc-core/scripts/discover_generic.py . --feature <closest-existing>

# sample Flutter — richer: enumerates sample_ui_kit widgets and segmentOf() route keys.
# The profile is project-scoped, so its path is inside the repo, not under ~/.claude/skills/
python3 .claude/skills/profile-flutter/scripts/discover_repo.py . -o .ai/architecture.md
```

Check the **Layer vocabulary observed** table in the output against the `layers` you set in
`.ai/aidlc.yaml`. If they disagree, the config is wrong, not the repo.

Now **read it** and correct it. The script guesses from filenames; it cannot tell a live
convention from a legacy one. The thing that catches people: a shared domain package exists,
but several features keep domain code inside the app anyway. Whichever is true, this file is
what every `touches` path will be derived from.

When it is right, sign it:

```yaml
verified_by: Akenzy
```

> Two minutes of reading here removes an entire class of fictional plan. It is the cheapest
> step with the highest leverage.

### Phase 0b — Questions, then init

Four questions, one message: what pain and for whom; one measurable success signal; what is
out of scope; any deadline or external dependency. Plus up to three that only discovery could
have raised.

```bash
aidlc init <name> --profile <your-profile-or-none>   # → .ai/features/YYYYMMDDNN-<name>/
aidlc -d .ai/features/<slug> status                  # <slug> is that directory name
```

`init` derives the directory itself, stamping it with the day planning started and that
day's sequence, so let it — passing `-d` here takes the path literally and you lose the
stamp. Every command after this
one takes `-d <that directory>`.

Expected — and this is the system working, not failing:

```
next:     G0 — Discovery and intent
tickets:  construction locked until G3

G0 precondition check: FAIL
  ✗ .ai/architecture.md has no verified_by — a human must read the draft map and sign it
  ✗ 00-intent.md still has 4 TODO placeholder(s)
```

Fill in `00-intent.md`, then:

```bash
aidlc -d .ai/features/<slug> pass G0 --by <you>
```

### G1 — Assumptions and requirements (~30–45 min)

Write `01-assumptions.md` and `02-requirements.md`. Then try to pass, and **expect refusal**:

```
refused: G1 preconditions not met
  ✗ 1 blocking assumption(s) pending: A-01
```

This is the pilot's central test. Take those blocking assumptions to whoever actually knows —
the backend team, the bank contact, your boss — and get answers. Record who and when:

```
| A-01 | GET /v1/orders is paginated | medium | yes | Data layer + paging UI | confirmed | Confirmed by backend team, 2026-07-25 |
```

Flipping `pending` to `confirmed` without a resolution note is also refused. That is deliberate:
laundering an assumption into a fact is the cheapest way to look finished.

### G2 — Design (~45 min)

`03-logical-design.md` needs Approach, Alternatives rejected, Error taxonomy, and at least one
ADR not left at `proposed`. If nothing in the design was hard to reverse, either the feature is
trivial or the alternatives were never really considered.

### G3 — Decomposition (~1 hour, the real work)

Cut 2–5 vertical slices. Each gets `uow.md` with a **Demo script**, and tickets with frontmatter
and a done-when checklist.

Writing the demo script is the honest test of a slice. If you cannot describe someone opening
the app and seeing it, you have cut horizontally and should merge it into the slice that makes
it visible.

```bash
uowg .ai/features/<slug> --write        # generate; refuses on cycles, oversized tickets, uncovered ACs
uowg .ai/features/<slug> --parallel     # write-conflict hazards
aidlc -d .ai/features/<slug> lint-touches --repo .
aidlc -d .ai/features/<slug> pass G3 --by <you>
```

`lint-touches` is where invented paths die. A path that exists nowhere and carries no `# new`
marker is fiction, and fiction in `touches` survives review.

### G4 — Construction

```bash
aidlc -d .ai/features/<slug> ready
aidlc -d .ai/features/<slug> start  T-01-01 --by bot
# implement, run tests, tick the done-when boxes in the ticket file
aidlc -d .ai/features/<slug> submit T-01-01 --by bot        # → review
aidlc -d .ai/features/<slug> accept T-01-01 --by <you>      # → done
```

An implementer cannot accept its own work. A ticket sitting in `review` keeps its dependents
blocked, so review lag shows up as stalled parallelism rather than as invisible debt. Working
solo, `done --no-review` still works and records the bypass.

### Sync and report

```bash
# core again — global, same path regardless of which repo you're reporting on
python3 ~/.claude/skills/ai-dlc-core/scripts/project_registry.py \
  --db ~/aidlc/central.db --scan .:<repo-label> --report
```

One repo makes the portfolio view thin. That is expected: the cross-repo queries are the whole
reason it exists, and they only earn their keep from repo two onward.

---

## Part 3 — Record as you go

Keep this alongside the plan. Without it, the outcome check in Part 4 is vibes.

```markdown
# Pilot log — <feature>

| Phase        | Wall-clock | Notes                           |
| ------------ | ---------- | ------------------------------- |
| 0a discovery |            | what the draft got wrong        |
| 0b questions |            | which answers you could not get |
| G1           |            |                                 |
| G2           |            |                                 |
| G3           |            |                                 |

## Gate refusals

| Gate | What it refused | Justified? | Cost to fix |
| ---- | --------------- | ---------- | ----------- |

## Assumption outcomes

| ID  | Blocking | Turned out | Found at | Would have cost if found in code |
| --- | -------- | ---------- | -------- | -------------------------------- |

## Estimate vs actual

| Ticket | Est | Actual | Why the gap |
| ------ | --- | ------ | ----------- |

## The demo

Did UOW-01's demo script run as written, in front of another person? y/n
```

---

## Part 4 — Reading the outcome

The commands running is not the result. These are.

### It worked if

1. **At least one blocking assumption was wrong**, and G1 surfaced it before any code depended
   on it. One caught contract mistake typically repays the whole planning cost. If all of them
   were right, the register cost you an hour and bought insurance you did not need — note that
   and see signal 2.
2. **A gate refused you at least once and you were glad it did.** If every gate passed first
   try, either this plan was unusually clean or the checks are too loose to be worth running.
3. **`lint-touches` caught something.** It caught fictional paths in the plan used to develop
   this system. Zero findings means discovery worked — or that you got lucky.
4. **UOW-01's demo ran as written.** This is the strongest single signal, because it proves the
   slices were vertical. If the demo needed the next slice to be finished first, the cut was wrong.
5. **Estimates landed within about 50%.** Consistently over 4h means the decomposition is too
   coarse, not that the ceiling is wrong.
6. **The report answered a question you actually had.** If you never opened it, the sync layer
   is not yet earning anything — which is fine on one repo, and the thing to re-check at repo three.

### It did not work if

- **Planning took longer than the feature.** For a 3–6 day feature, more than a day of planning
  means the phases are too heavy for this size of work, or too much design was pushed into G2
  that belonged in a spike ticket.
- **You edited `.aidlc-state.yaml` to move on.** That is real signal, not a failure of
  discipline. Something in the gate did not fit the work. Change the gate deliberately, or drop
  it — a gate everyone has learned to route around is worse than no gate.
- **Every gate passed first try and nothing was caught.** The apparatus cost you time and
  returned nothing measurable.
- **The tickets went stale mid-implementation** and you stopped updating them. That means the
  plan was not load-bearing; it was documentation, and documentation nobody maintains is a
  liability.

### Then decide

| Outcome                                | Next                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ≥3 "worked" signals                    | Second repo. Different stack, so the profile mechanism gets tested.                                          |
| 1–2 signals                            | Keep it, trim it. Usually G2 is the heavy one — try folding it into G3 for small features.                   |
| 0 signals, or you routed around a gate | Keep only `uow_graph.py` and `lint-touches`. They are cheap and catch real errors. Drop the gate controller. |

Dropping most of it after an honest pilot is a good outcome. Keeping all of it because it was
built is not.

---

## Correction to an earlier draft

The first version of this runbook hardcoded the sample Flutter profile into every command,
while simultaneously telling you to pick whichever repo you would genuinely plan a feature in.
Those two instructions contradict each other: on a non-Flutter repo the Flutter discovery
script finds nothing at all — zero packages, zero stack, zero modules — and you would sign
`verified_by` on an empty map.

The cause was that only one profile existed, so it got treated as the default rather than as
one option. That assumption belonged in an assumption register, not baked into a runbook.
`discover_generic.py` now covers any stack, and the profile is an explicit choice above.

## Known issues found during validation

Running this end-to-end on a clean repo before publishing it surfaced a genuine bug: the
frontmatter parser stripped trailing comments from *all* lines, which destroyed the `# new`
marker that `lint-touches` relies on to allow paths that do not exist yet. Every correctly
annotated new path was being rejected. Fixed by stripping comments from scalar values only and
preserving them on list items.

Worth stating because it is the argument for the dry run: two features written weeks apart
conflicted, and only running the whole chain in order exposed it.

## After installing a ruleset upgrade

`ai-dlc-core` is installed globally, so copying a new version into `~/.claude/skills/`
changes the controller for **every** repo on the machine at once — including ones nobody
is looking at today. Ruleset 5 is the first upgrade to change what a gate accepts, and the
compatibility design is per plan rather than per repo: `aidlc init` stamps the tool's
ruleset into `.aidlc-state.yaml`, and a plan with no stamp is judged under ruleset 4. Every
plan that existed before the upgrade is unstamped, so nothing in the field changes verdict.

That is the intent. This is how you confirm it, per repo, in about a minute:

```bash
cp -r skills/ai-dlc-core ~/.claude/skills/          # the upgrade
uowg --version                                       # -> uow_graph 0.5.0 (ruleset 5)

# for each repo that has plans — erp2, erp3, jack-erp, ...
cd <repo>
for f in .ai/features/*/; do
  aidlc -d "$f" check G4     # verdict must match what it was before the upgrade
done
```

What you should see, and what each thing means:

| Output | Meaning |
| ------ | ------- |
| `plan authored under ruleset 4 — judged by those rules` | Correct. The plan predates the upgrade and is unaffected |
| `warn: plan was authored under ruleset 4, tool enforces 5` | The repo-level pin in `.ai/aidlc.yaml` is advisory. Bump it to `5` when you want *new* plans in that repo held to the new rule |
| A verdict that changed | A defect in the upgrade, not in your plan. Roll back the install and say so |

Verdicts must be identical; **warnings may differ** — the migration hint is new by design.

This was run against the three plans closed in this repo before shipping ruleset 5:
`2026082801-agent-chat-console` (G4 pass, G5 fail — pre-existing, a pending assumption),
`2026082901-ticket-detail-drawer` and `2026082902-skill-file-viewer` (both pass). Six
checks, six identical verdicts, the only difference being the new warning line.

### The console reads the same files

`apps/api` shells out to this controller and parses the same artifacts, and
`filesystem-feature-plan.reader.ts` deliberately mirrors `REQUIRED_INTENT_SECTIONS` and
`assumption_rows` from `aidlc.py`. Ruleset 5 touches neither of those, but it does add a
top-level `ruleset:` key to `.aidlc-state.yaml` and a new `action: evidence` to the trail,
so the reader has to tolerate both:

```bash
pnpm skills:check && pnpm typecheck && pnpm test
git diff --stat -- apps/          # must be empty; this change edits nothing there
```

Checked before shipping ruleset 5: 27 test files / 184 tests green, both typechecks clean,
and `FilesystemGateStateReader` verified against a real ruleset-5 state file carrying
evidence entries — it stores unknown top-level scalars and ignores them, and an unfamiliar
`action` reaches `AuditEntry` as a plain string. Nothing under `apps/` was edited.

Turning verification *on* for a repo is a separate, opt-in step — add an `evidence:` block
to its `.ai/aidlc.yaml` (see `skills/ai-dlc-core/references/templates.md`). Until you do,
nothing is ever executed and G4 asks for no runs.

## Reference

| Need                                         | Read                                                         |
| -------------------------------------------- | ------------------------------------------------------------ |
| Why each gate exists                         | `skills/ai-dlc-core/references/methodology.md`                      |
| Artifact templates and frontmatter schemas   | `skills/ai-dlc-core/references/templates.md`                        |
| What to ask a human vs look up               | `skills/ai-dlc-core/references/discovery-protocol.md`               |
| Sync options, `.gitignore`, CI               | `skills/ai-dlc-core/references/sync.md`                             |
| Flutter conventions and DoD (example only)   | `examples/profile-flutter/references/flutter-rules.md` |
| Adding a second stack, and where it installs | `skills/ai-dlc-core/references/profile-contract.md`                 |
