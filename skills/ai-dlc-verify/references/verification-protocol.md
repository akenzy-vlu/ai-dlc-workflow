# Verification protocol

When verification applies, what it can read off the project, what it must ask a human, and how
it behaves when it cannot run. Read this at G3, before writing the UoW template — the decision
this file describes changes what goes into `uow.md`.

## The ladder, in order

Run `verify.py <feature-dir> --doctor` and act on the rung it reports. Do not infer the rung
from the presence of a config file, an installed browser driver, or a previous session's output.

### Rung 1 — not applicable

No `verify:` block in `.ai/aidlc.yaml`. The project has not opted in.

Write **no** verification section into `uow.md`. G4 behaves exactly as stock AI-DLC: the demo
script is run by a human, in front of a human, and that is the gate.

Do not offer to add a `verify:` block mid-feature. Adding one at G4 means writing checkboxes
that the current UoW was never planned against.

### Rung 2 — skipped

A `verify:` block exists, `auth.recipe` is not `none`, and the credentials it needs are absent
or blank in `.ai/credentials.env` (and in the process environment).

The run prints one line and exits 0:

```
verify: skipped — no credentials configured for local, staging (auth.recipe: form)
```

No browser is launched. No `evidence/` directory is created. No `08-evidence.md` is written. A
partially-written evidence tree is worse than none, because the next session reads it as a
result.

Write **no** verification section into `uow.md`. The PR draft, if one is generated at all,
carries a single honest line instead of images:

```markdown
**Verification** · skipped — no credentials configured for this project
```

This is the common case on a fresh clone, on a colleague's machine, and in CI. It must be
uneventful. Do not prompt for credentials, do not open a browser to ask, do not fail.

### Rung 3 — capable

Configured, and every required environment has what its recipe needs.

Write the verification section from `templates.md` into `uow.md`. It becomes a real G4
precondition, because core refuses to advance while any checkbox is unticked.

### The two states that are not rungs

**Config error** — a contradiction the tool must not resolve on its own: an environment that is
`required: true` and `enabled: false`, a viewport with no width, an unknown `recipe`, a
`07-verification.md` naming an environment the config does not define. Reported by `--doctor`
as `config error`, exit 1. Fix the config; do not let it degrade to "skipped", because that
would silently drop a required environment.

**Runner not installed** — the rung is `capable` but the interpreter that would run
`scripts/runner/run.py` has no Playwright. This is a machine problem, not a project one, and it
is reported on its own line with the exact install command. A run in that state exits 1 rather
than writing an empty evidence tree. On a system Python that refuses `pip install`, put
Playwright in a venv and set `AIDLC_VERIFY_PYTHON` to its interpreter.

## Discoverable vs undiscoverable

Core's stance holds here: the repo answers questions about itself, and a human answers only
what no file contains.

**Read off the project — never ask:**

| Question | Where it is answered |
|---|---|
| What is the local dev URL and port? | the dev script, its config, the README |
| Which routes exist? | the router directory or route table |
| What does the login form look like? | the sign-in page component |
| Which breakpoint does the app branch on? | the CSS config, and any `matchMedia` hook |
| Which ACs must be evidenced? | `verifies:` on the UoW, `02-requirements.md` |
| Did the run pass? | `run.json` |

**Ask a human — no file contains these:**

1. **The staging and production URLs.** Deploy targets usually live in a CI config or a hosting
   dashboard, not in the repo. Guessing one and screenshotting the wrong tenant is the most
   expensive mistake this tool can make.
2. **Which account to verify as.** Role gating means a viewer and an admin see different
   navigation, and evidence captured as the wrong role silently omits the feature.
3. **Whether writes are acceptable in each environment.** A verification step that creates a
   record is fine on local, usually fine on staging, and not a decision to make unilaterally
   anywhere else.
4. **Whether this feature is responsive at all.** Not every screen has a mobile design. Ask
   before declaring `viewports: [desktop, mobile]`; a mobile screenshot of a layout nobody
   designed for mobile is noise that will be ticked without being read.

Ask these in one batch, at G3, alongside the decomposition questions — not one at a time, and
not at G4 when the evidence is already overdue.

## What makes a step pass

A screenshot is the *record* of a passing step, not the definition of one. A step passes when
all five hold:

1. Navigation reached the declared path without an unhandled redirect. Landing on a sign-in
   page means the session expired — that is a failed step, not a screenshot of a login form.
2. The `ready_when` condition was met before the shot. Without it you capture skeletons.
3. No configured `failure_signal` fired. Apps that surface errors as toasts or banners give you
   a precise, app-specific failure detector for free — use it.
4. No `console.error` was logged during the step, when `console_errors` is configured.
5. Every claim in the `Assert` column held.

A step that captures a blank page which silently 403'd is worse than no evidence at all,
because it looks like evidence and will be ticked.

The screenshot is taken **whether the step passed or failed**. A red step's screenshot is the
defect report, and discarding it would throw away the most useful artifact of a failed run.

## Ordering within a run

Environments run in the order declared; viewports run inner. Each environment begins with a
**warm-up**: one request whose result no verdict is derived from, taken before the session is
established. The session is then established once and reused across every step and every
viewport in it — logging in per step is slow and, on an app with rate limiting, self-defeating.

Warm-up is there because the first request of a run is frequently not like the others — a cold
load balancer, a container booting on demand — and the alternative framing is worse. Wrapping a
retry budget around the steps would make a slow environment and a real regression look the same,
and the mechanism that hides the first would eventually hide the second. Naming the cold start
as its own phase keeps both visible: the warm-up duration lands in `run.json` and in the
evidence report, and a step that goes red is still a step that went red.

An environment that never answers the warm-up is a **named outcome**, not a wall of failed
steps: it fails, it says `unreachable`, and it is not confused with a rejected credential. See
`config-schema.md` for the `warmup:` keys and why `attempts` is capped.

A failed step does not abort the run. Every remaining step still executes, so one run tells you
everything that is broken rather than only the first thing. The run's exit code is 1 if any
required environment had any failed step.

A failed *login* does abort that environment — every step after it would fail for the same
reason, and forty identical failures bury the one that matters. The remaining environments
still run.

## When the run cannot log in

Four distinct outcomes, and they must not be conflated:

- **The environment never answered** → `unreachable`, exit 1 if it was required. The warm-up
  exhausted its attempts, so no credential was ever tried and nothing there was verified. Do not
  report this as a login failure or as failed steps.
- **Credentials missing** → rung 2, `skipped`, exit 0. Not an error.
- **Credentials present but rejected** → failure, exit 1. Wrong password, disabled account, or
  an expired saved session. Say which environment and what the app showed.
- **Credentials present, accepted, but the app demanded something more** — a second factor with
  no secret configured, an unfinished account-setup task, a consent screen. Fail with that
  specific sentence and point at `--manual-login`. Do not retry, and do not sit in a timeout;
  an interactive challenge will never resolve in a headless browser.

The `--manual-login` escape hatch opens a headed browser, waits for you to finish
authenticating by hand, saves the session, and exits. Nothing about your credentials is read or
stored by the tool on that path. It is the right answer for SSO, captcha, and hardware keys —
cases no recipe should try to automate.

## What never enters the output

Credentials, tokens, and saved session files are inputs only. `run.json`, `08-evidence.md`, the
report and the PR draft carry environment names, URLs, verdicts, timings, a browser version and
a commit sha — never a value read from `.ai/credentials.env`. The run plan that carries them to
the browser runner is piped over stdin and never written to disk, so an interrupted run leaves
no secret behind.

Screenshots are a different risk: they contain whatever the account can see, which on staging
may be real customer data. That is a decision for the human choosing the verification account,
and it is worth stating out loud at G3 rather than discovering in a pull request.
