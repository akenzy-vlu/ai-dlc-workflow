# Verification templates

Two artifacts and one block. `07-verification.md` is hand-written and continues core's
numbering; `08-evidence.md` is generated and must never be hand-edited; the evidence block is
what goes into `uow.md` — and only on the `capable` rung.

As with core's templates: the parser finds sections and table rows by shape, so **keep the
heading text and the column order as written here rather than paraphrasing them.** A heading
the checker cannot find is a failed gate.

---

## `07-verification.md` — hand-written

```markdown
---
feature: <slug>
environments: [local, staging]
viewports: [desktop, mobile]
---

# Verification — <feature title>

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Course list shows only open sections | `/{tenant}/courses` | — | AC-01 | `no-text=Closed` |
| S2 | Filtering by term narrows the list | `/{tenant}/courses` | `click [data-test=term-filter]; click text=Spring` | AC-02 | `count tbody tr = 3` |
| S3 | Course detail opens from the first row | `/{tenant}/courses` | `click table tbody tr:first-child` | AC-03, AC-04 | `text=Enrolled` |

## Not verified here

AC-05 is a nightly job with no UI surface — covered by the unit test in T-02-03, not by a
screenshot.

## Notes

Run as an account with the manager role; the term filter is hidden for viewers.
```

### Frontmatter

| Key | Meaning |
|---|---|
| `feature` | the feature slug, matching the directory |
| `environments` | which configured environments this feature is verified on; must be a subset of the `verify.environments` names |
| `viewports` | which configured viewports to capture at |

`viewports` is where *"responsive if required"* becomes a real switch. A screen with no mobile
design declares `viewports: [desktop]`, and the mobile evidence requirement stops applying to
it. That is better than every feature carrying a mobile checkbox that gets ticked without being
looked at.

### The steps table

Five columns, positional, plus an optional sixth. Rows are recognised by an id matching
`S<digits>` in the first cell, so the header and separator rows are skipped without special
handling — the same way core parses the assumption register.

| Column | Content |
|---|---|
| `ID` | `S1`, `S2`, … — unique within the file; becomes the screenshot filename |
| `Step` | what a reader should see in the screenshot, in one line |
| `Path` | the route, with `{placeholders}` resolved from the landing URL |
| `Interaction` | `—` for none, or a `;`-separated action list |
| `Verifies` | comma-separated AC ids from `02-requirements.md` |
| `Assert` | *optional* — what must be true on screen; `—` or omitted for none |

**Write the `Assert` column.** Without it a step passes whenever the page loaded and no failure
signal fired, which cannot tell a correct total from a wrong one — a run can be entirely green
while the feature computes the wrong number, and that green is worse than no evidence because
it will be believed. Three forms, chained with `;`:

```
text=<value>       that text must be visible
no-text=<value>    that text must NOT be present
count <sel> = n    exactly n matches for the selector
```

An assertion states what *should* be true, which is what lets one mechanism do two jobs. On a
healthy build it keeps green meaningful. On a broken one the step goes red and the screenshot —
captured regardless of verdict — becomes the defect evidence. When the bug is fixed the step
turns green with no edit to the script.

That makes a **deliberately red step** the honest way to record a known defect: assert the
correct behaviour, let it fail, and put those rows under their own `## <heading>` so a reader
sees at a glance which failures are known. A red required environment blocks G4 — which is the
correct state while the defect is open, and is precisely the signal a green-only run destroys.

**Interactions** are deliberately small. Four verbs, chained with `;`, executed in order before
the screenshot:

```
click <selector>
fill <selector> = <value>
wait <selector>
scroll <selector>
```

If a step needs more than about three of these, it is really two steps — and two screenshots
tell a reviewer more than one does.

Every AC id in `Verifies` must exist in `02-requirements.md`. An unknown id is a warning, the
same way `uow_graph.py` already warns about a ticket verifying an AC that was never written.

### `## Not verified here`

Optional but worth writing. An AC with no UI surface — a scheduled job, a log line, a
migration — should be named here with what does cover it. Otherwise the next reader assumes the
screenshot is missing rather than inapplicable.

---

## The `uow.md` block — only on the `capable` rung

Append to `uow.md` at G3, **after** `verify.py --doctor` reports `capable`:

```markdown
## Verification evidence
- [ ] `verify.py <feature-dir> --write` green on every required environment
- [ ] Evidence exists for every AC in `verifies`, at every declared viewport
- [ ] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
```

Core refuses `pass G4` while any `- [ ]` anywhere in `uow.md` is unticked, and it counts boxes
across the whole file rather than under a named heading — so this section is enforced exactly
like the definition-of-done above it. That is the entire mechanism, and it is why the block
must not be written on the other two rungs: checkboxes a project can never satisfy turn G4
into a wall, and the way out of a wall is editing state, which is the one move that makes the
apparatus theatre.

Tick these only after `evidence_check.py` exits 0. A ticked box that `evidence_check.py`
contradicts is the failure mode this package exists to prevent.

---

## `08-evidence.md` — generated

Written by `verify.py --write`. Regenerate it; never edit it.

```markdown
<!-- GENERATED by aidlc_verify 0.2.0 — do not edit; re-run verify.py --write -->
# Evidence — <feature title>

status: pass · 6/6 steps · 2 environments × 2 viewports
commit: a1b2c3d · chromium 141.0.7390.54 · 2026-08-12T09:14:22Z

## Environments

| Env | Gates | Warm-up | Login |
|---|---|---|---|
| local | yes | 0.3s | ok |
| staging | yes | 12.4s · 2 attempts | ok |

## Runs

| Env | Viewport | Step | Verdict | Duration |
|---|---|---|---|---|
| local | desktop | S1 | pass | 1.8s |
| local | mobile | S1 | pass | 1.6s |
| staging | desktop | S1 | pass | 2.4s |

## Coverage

| AC | Steps | local | staging |
|---|---|---|---|
| AC-01 | S1 | desktop, mobile | desktop, mobile |
| AC-02 | S2 | desktop, mobile | desktop, mobile |

## PR draft

<the block below>
```

`run.json`, the per-step screenshots and `contact-sheet-<env>.png` are written beside it under
`evidence/`. Nothing else is generated — the evidence lives in markdown and PNGs, so it reviews
in the pull request rather than in a downloaded file.

---

## The PR draft

The last section of `08-evidence.md`, meant to be copied whole. Short — bullets and one
metadata line. A pull request description is read in about fifteen seconds; a wall of tables
is skipped, and skipped evidence is not evidence.

```markdown
## <TICKET> — <feature title>

- <what changed, in the reviewer's terms>
- <the one thing worth knowing that the diff does not show>
- AC-01 · AC-02 · AC-03 verified

**Verified** · local + staging · desktop 1440 · mobile 390 · chromium 141 · `a1b2c3d`

<!-- DROP contact-sheet-local.png HERE -->
<!-- DROP contact-sheet-staging.png HERE -->
```

The drop markers are for GitHub's own attachment upload: paste the block into the description,
then drag the named PNG onto its marker line. GitHub hosts the image and rewrites the markdown,
so the evidence renders inline without any binary entering the repository and without needing
an authenticated CLI. One composite per environment keeps it to two drops rather than forty.

When a step failed, the metadata line says so and names the steps — a PR draft that reports a
green run over a red one is the worst output this package could produce:

```markdown
**Verification** · 5/6 passed · S4 failed on staging (app surfaced an error toast)
```

When the run was skipped, one honest line and no markers:

```markdown
**Verification** · skipped — no credentials configured for this project
```
