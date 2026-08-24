# Syncing plans to a central report

Two situations, and they need different pipes.

| `.ai/` is… | Sync direction | Durable record lives in |
|---|---|---|
| Committed to git | **Pull** — the collector reads checkouts | Git |
| Local only | **Push** — `aidlc snapshot` ships JSON | The collector, which must then be backed up |

Committing is the better position, and not only for durability: it is the only one where a
gate transition appears in a diff someone reviews.

---

## The trail, and why it does not conflict

Gate and ticket events are appended to `history.jsonl` — one JSON object per line, never
rewritten — and the feature directory carries a `.gitattributes` declaring it
`merge=union`. Two people who approve two different things on two machines therefore
merge with no conflict and no entry lost, because git keeps both sides' lines rather than
choosing between them.

`.aidlc-state.yaml` is a **view** folded from that trail: `current_gate` is a replay of
the events, not an independent fact. It is still written and still committed, so every
existing reader keeps working — but it is a whole-file rewrite, so it *is* what conflicts
on a merge. The resolution is two commands, and it never involves deciding whose approval
survives:

```bash
aidlc -d .ai/features/<slug> reconcile   # rebuilds the view from the trail
git add .ai/features/<slug>/.aidlc-state.yaml
```

`reconcile` also reports when a gate was approved more than once — both approvals stay on
the record, because two people independently approving the same gate is a fact about what
happened, not a conflict to clean up.

Two smaller consequences:

- `.aidlc-state.lock` is a machine-local write lock. `aidlc` gitignores it from inside the
  feature directory; nothing needs doing.
- A checkout that has `history.jsonl` but no `.aidlc-state.yaml` still works — the trail is
  sufficient, and `reconcile` regenerates the view.

## First: stop generated files from conflicting

The one real argument against committing `.ai/` is that parallel agents regenerate
`05-ticket-graph.md`, `06-traceability.md` and `registry.yaml`, and collide. The fix is
narrow — ignore the three derived files, commit everything hand-written:

```gitignore
# .gitignore — derived from the tickets; regenerate with `uow_graph.py --write`
.ai/features/*/05-ticket-graph.md
.ai/features/*/06-traceability.md
.ai/features/*/registry.yaml
```

Nothing is lost: those three are functions of the tickets. What survives is the part with
judgement in it — intent, assumptions, requirements, design, ADRs, the UoW cuts, the tickets,
and the gate state.

`project_registry.py --scan` builds its rows from the tickets, not from `registry.yaml`, so a
repo that ignores the generated files still reports correctly.

## What a reviewer sees

After one `accept`, the diff is three files — the trail, its view, and the ticket:

```
.ai/features/refund/history.jsonl                    |  2 ++
.ai/features/refund/.aidlc-state.yaml                | 15 +++++++++++++++
.../UOW-01-refund-command/tickets/T-01-01.md         |  6 +++---
```

```diff
+{"action":"ticket review","at":"2026-08-23T14:02:11","by":"bot","gate":"G4","id":"9f2c…","ticket":"T-01-01","ts":"…"}
+{"action":"ticket done","at":"2026-08-23T14:19:40","by":"Akenzy","gate":"G4","id":"41ab…","ticket":"T-01-01","ts":"…"}
```

The `id` is a hash of the event's own fields, so the same approval arriving through two
routes is recognised as one rather than counted twice.

An approval that shows up in a diff is an approval someone can object to. That is the
property push-based sync cannot reproduce.

---

## Option A — Collector pulls (recommended)

The collector holds bare or shallow clones and refreshes them on a timer. No per-repo setup,
one place to operate, and adding a repo is one line of config.

```bash
#!/usr/bin/env bash
# sync-plans.sh — run from cron or a systemd timer on the collector
set -euo pipefail
ROOT=/srv/aidlc/repos
DB=/srv/aidlc/central.db

# label → clone URL. The label is what appears in the report.
declare -A REPOS=(
  [mobile-app]=git@github.com:example/mobile-app.git
  [payment-svc]=git@github.com:example/payment-svc.git
)

args=()
for label in "${!REPOS[@]}"; do
  dir="$ROOT/$label"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" fetch --quiet origin
    git -C "$dir" reset --hard --quiet origin/HEAD
  else
    git clone --quiet --filter=blob:none "${REPOS[$label]}" "$dir"
  fi
  args+=("$dir:$label")
done

python3 project_registry.py --db "$DB" --scan "${args[@]}"
```

Reports mainline only, which is usually what a portfolio view should show. Feature-branch
plans stay invisible until merged — a feature, not a defect.

**Trade-off:** lag equals the timer interval, and work-in-progress on branches does not appear.

## Option B — CI pushes on merge

Lower latency and no credentials on the collector, at the cost of a workflow per repo.

```yaml
# .github/workflows/plan-sync.yml
on:
  push:
    branches: [main]
    paths: ['.ai/**']

jobs:
  sync:
    runs-on: self-hosted        # the Mac Mini runner
    steps:
      - uses: actions/checkout@v4
      - name: Validate the plan
        run: |
          for f in .ai/features/*/; do
            aidlc -d "$f" check G3 || echo "::warning::$f below G3"
            aidlc -d "$f" lint-touches --repo . || exit 1
          done
      - name: Ship snapshots
        run: |
          for f in .ai/features/*/; do
            aidlc -d "$f" snapshot --to /tmp/inbox --repo . --label ${{ github.event.repository.name }}
          done
          rsync -a /tmp/inbox/ collector:/srv/aidlc/inbox/
```

Note the validation step. This is where gate checking escapes the agent session: a human who
pushes a plan with a fictional `touches` path fails CI, whether or not an agent was involved.

## Option C — Local git hook

Immediate feedback, but per-machine setup and trivially bypassed with `--no-verify`. Fine as a
convenience, not as a control.

```bash
# .git/hooks/post-commit
for f in .ai/features/*/; do
  aidlc -d "$f" snapshot --to ~/.aidlc/inbox --repo . --label "$(basename "$PWD")" || true
done
```

---

## Combining pull and push

They are not exclusive, and mixing them answers a question neither does alone: *what is
planned on mainline, versus what someone is working on right now?*

- Pull on a timer → mainline truth, labelled `<repo>`
- Push from a dev machine → work in progress, labelled `<repo>-wip`

The `snapshot_log` table records `host`, `git_branch` and `dirty` for every snapshot, so the
report can separate the two rather than averaging them into something misleading.

## Once git holds the history

`gate_event` stays append-only, but it stops being the only durable copy — `git log -p --
.ai/features/<slug>/history.jsonl` reconstructs the same trail, independently, with commit
signatures attached. Treat the table as an index for querying, and git as the record of
account. If the two ever disagree, git wins.
