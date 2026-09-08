# Configuration schema

Every key of the `verify:` block in `.ai/aidlc.yaml`, and the credentials file beside it.
Core already reads `profile`, `ruleset` and `layers` from that file; verification adds one
block rather than opening a second config tree.

## The block

```yaml
verify:
  environments:
    <name>:
      url: <string>            # required; ${VAR} interpolated from .ai/credentials.env
      enabled: <bool>          # default true — false means configured but never run
      required: <bool>         # default false — true means this env gates G4
      writes: <bool>           # default true — false marks the env read-only; advisory
      auth: {...}              # optional; overrides the global auth block for this env
      warmup: {...}            # optional; overrides the global warmup block for this env
  viewports:
    <name>:
      width: <int>             # required
      height: <int>            # required
      isMobile: <bool>         # default false — touch events + mobile user agent
      deviceScaleFactor: <num> # default 1
  auth:
    recipe: <string>           # clerk-hosted | form | storage-state | none
    path: <path>               # the sign-in route; recipe-specific default
    landing: <path>            # default "/" — where a signed-in session lands
    capture: <pattern>         # optional; extracts {placeholders} from the resolved landing URL
    ready_when:                # optional; how to know the landing page finished
      gone: <selector>         #   wait until this disappears
      visible: <selector>      #   wait until this appears
    selectors: {...}           # recipe-specific; see login-recipes.md
    credentials_prefix: <NAME> # optional; default is the env name upper-cased
    post_login: <string>       # optional; interactions to run between login and "app is usable"
    interactive_paths: [...]   # paths that mean the app demanded a human; fail, never wait
  warmup:
    path: <path>               # default "/" — what to request before judging anything
    attempts: <int>            # default 1, ceiling 5; 0 disables warm-up entirely
    timeout_ms: <int>          # default: the global timeout_ms
  failure_signals:
    - { selector: <sel>, message: <text> }
    - console_errors
  timeout_ms: <int>            # default 30000, per navigation
```

Nothing else is read. Unknown keys are ignored, so a newer config on an older install
degrades rather than crashing — the same tolerance core's frontmatter parser has.

The parser is a YAML subset, like core's: mappings, block and inline lists, inline maps,
scalars, `#` comments. It does not implement anchors, multi-line strings or nested inline
maps. **A comma inside an inline map splits it** — write a selector containing a comma in
block form:

```yaml
    - selector: ".toast-error, .alert-danger"
      message: "app surfaced an error"
```

## environments

At least one is required for the block to mean anything. The name is free — `local`,
`staging`, `prod`, `preview`, `qa` — and is used verbatim in evidence paths and the report.

`enabled: false` is how an environment stays documented without ever being visited. Production
usually belongs here, with `writes: false` beside it, so the config states the intent rather
than leaving the environment undescribed and one flag away from being run by accident.

`required: true` is what couples an environment to the gate. `evidence_check.py` demands a
passing screenshot for every AC in every required environment — narrowed to the environments the
feature's `07-verification.md` declares, so a slice that touches one of two frontends is not
asked for evidence from the other. A non-required environment that ran and failed is reported but
does not block. Set it on the environments you would genuinely refuse to merge without.

### One system, two frontends

An "environment" does not have to be a deployment stage. When a system ships more than one
frontend — an admin console and a point-of-sale terminal, say — each is its own environment, and
`environments.<name>.auth` gives it its own sign-in path, selectors and post-login steps:

```yaml
environments:
  local-backoffice:
    url: http://localhost:3000
    required: true
    auth: { recipe: form, path: /login, credentials_prefix: BACKOFFICE }
  local-pos:
    url: http://localhost:3001
    required: true
    auth: { recipe: form, path: /dang-nhap, credentials_prefix: POS }
```

The override merges over the global `auth:` block; `selectors` and `ready_when` merge key by key,
everything else replaces. Credentials follow the environment name unless `credentials_prefix`
says otherwise, so without the prefixes above these would read `LOCAL_BACKOFFICE_*` and
`LOCAL_POS_*` — and can be different accounts either way.

The cost is that **a step table runs against every environment the feature declares**. There is
one `Steps` table per feature, so a path that exists only in the POS app cannot be verified from
the backoffice environment. Write one `07-verification.md` per app — declare
`environments: [local-pos]` and list only POS paths — and split a slice that genuinely touches
both into two Units of Work.

An environment that is `enabled: false` and `required: true` is a contradiction —
`--doctor` reports it as a config error rather than resolving it silently.

## viewports

Names are free; `desktop` and `mobile` are conventional. Two rules worth stating:

**Straddle the breakpoint, do not sit on it.** Pick widths comfortably either side of the value
your app branches on. At exactly the cutoff, a CSS `min-width` media query and a JS
`matchMedia("(max-width: N-1px)")` hook disagree about which side you are on, and a screenshot
taken there proves nothing about either layout.

**`isMobile: true` is not the same as a narrow window.** It sends a mobile user agent and
enables touch events, so components that branch on pointer type render their real mobile
variant. A narrow desktop window will silently render the desktop branch of anything gated on
touch.

## auth

`recipe` selects a login strategy from `login-recipes.md`. `none` means the app is public and
the runner navigates straight to the steps.

`landing` is where a signed-in session ends up. Apps that redirect through a resolver — picking
a default tenant, workspace, or organisation — resolve their ids here, and `capture` is how you
name the segments they land on:

```yaml
landing: /
capture: /{account}/{workspace}/*
```

After login the runner reads the resolved path, matches it against that pattern, and exposes
`{account}` and `{workspace}` to every step path. `{name}` matches one segment; `*` matches the
rest. Without `capture`, step paths must be literal.

This is what keeps a specific account out of `07-verification.md`. A step path with a real
tenant id in it stops working the moment someone verifies as a different user, and the failure
looks like a broken feature rather than a stale plan.

`interactive_paths` lists route fragments that mean the app accepted the password and then
demanded something a script must not complete on someone's behalf — enrolling a second factor,
accepting terms, finishing account setup. Landing on one is a named failure pointing at
`--manual-login`, never a timeout. Each recipe ships sensible defaults; override only when your
app has its own.

`ready_when` is the difference between a screenshot of your feature and a screenshot of a
spinner. Prefer `gone:` pointed at whatever loading indicator the app shows — it is more robust
than waiting for a specific element, which changes whenever the feature does.

`post_login` takes the same four verbs as a step's `Interaction` column (`click`, `fill`,
`wait`, `scroll`, chained with `;`) and runs once per environment, after login and before the
first step. It is for the modal that greets a fresh session — a tour, a cookie banner, a
branch picker — not for navigation.

## warmup

One request per environment, taken **before any verdict**, whose result no step can be derived
from. It exists because the first request of a run is frequently not like the others: a load
balancer scaled to zero, a container that boots on demand, a connection pool that opens lazily.

```yaml
verify:
  warmup: { attempts: 1 }              # the default — one probe, the global timeout
  environments:
    staging:
      url: "${STAGING_URL}"
      required: true
      warmup: { attempts: 3, timeout_ms: 90000 }
```

**This is not a retry, and the difference is the whole point.** A retry wrapped around a step
says "the assertion failed, try again" — which hides a real regression behind the same mechanism
that hides a slow environment. Warm-up says "the environment was not up yet, so nothing has been
judged". It retries only on transport failure (connection refused, DNS, navigation timeout) or a
gateway status — `502`, `503`, `504`, the ones that mean the edge answered while the thing behind
it was still starting. A `500` is the app answering with its own bug: warm-up treats that as
success and lets the steps produce real evidence of it.

Some consequences worth stating:

- **`attempts` is capped at 5.** An environment that needs six probes is broken, not cold, and a
  budget that large would start absorbing genuine failures. Raise `timeout_ms` instead — waiting
  longer for one request is honest in a way that probing repeatedly is not.
- **`attempts: 0` disables it.** Correct for a local dev server you already know is running.
- **A failed warm-up is a named outcome**, distinct from a rejected credential and from a failed
  step: the environment never became reachable, so nothing there was verified. It fails a
  required environment, and the report says `unreachable`, not `login failed`.
- **The duration lands in `run.json` and in `08-evidence.md`.** That is deliberate: a staging
  environment that takes 40 seconds to answer its first request is a fact worth seeing on the
  pull request, and `flaky` as a label would have thrown that information away.

## failure_signals

Two forms. A selector form:

```yaml
- { selector: ".Toastify__toast--error", message: "app surfaced an error toast" }
```

and the bare token `console_errors`, which fails a step when anything logs at `console.error`.

Apps that already surface their own errors — an error toast, an alert banner, an inline
boundary — hand you a precise failure detector for free. One selector here catches every
authorisation failure, expired token and network error the app knows how to report, which is
far more than a screenshot comparison would.

## Credentials

`.ai/credentials.env` — plain `KEY=value`, `#` comments, no interpolation of its own. Never
committed; the safest posture is ignoring all of `.ai/`.

```
STAGING_URL=
LOCAL_EMAIL=
LOCAL_PASSWORD=
STAGING_EMAIL=
STAGING_PASSWORD=
STAGING_TOTP_SECRET=      # only if the account has TOTP enforced
```

The process environment is consulted as a fallback for any key the file does not define, which
is what makes the same config work in CI without a credentials file on disk.

Which keys a recipe needs is that recipe's business; see `login-recipes.md`. Two rules hold
across all of them:

- **A blank value is the same as a missing one.** Both mean "not configured", which is rung 2 of
  the ladder — a skip, not a failure. A file full of empty placeholders is the expected state
  on a fresh clone.
- **Values are read, never written or echoed.** `--doctor` reports presence, never content. No
  value from this file reaches `run.json`, the report, the PR draft, or a log line. The run plan
  that carries them to the browser runner is piped over stdin and never written to disk.

`${VAR}` in the `verify:` block interpolates from here. That is deliberate: URLs for
non-public environments are frequently as sensitive as the passwords, and keeping them out of
the config file means `.ai/aidlc.yaml` stays safe to share when the rest of `.ai/` is not.

An unresolved `${VAR}` is not an error — it means "not configured on this machine", which is
rung 2. A required environment whose URL cannot be resolved skips the whole run rather than
guessing a host.

## Worked example

A Next.js app behind a hosted auth component, verified on two environments, production
described but off:

```yaml
profile: profile-acme-web
ruleset: 5
layers: [page, component, state, api, schema, util, verify]

verify:
  environments:
    local:   { url: http://localhost:3000, required: true }
    staging: { url: "${STAGING_URL}",      required: true }
    prod:    { url: "${PROD_URL}", enabled: false, writes: false }
  viewports:
    desktop: { width: 1440, height: 900 }
    mobile:  { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }
  auth:
    recipe: clerk-hosted
    path: /sign-in
    landing: /
    capture: /{tenant}/*
    ready_when: { gone: "text=Loading" }
  failure_signals:
    - { selector: ".Toastify__toast--error", message: "app surfaced an error toast" }
    - console_errors
```

The app branches at 1024, so the viewports are 390 and 1440 — neither of them 1024.
