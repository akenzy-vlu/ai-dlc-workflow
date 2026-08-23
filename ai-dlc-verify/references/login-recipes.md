# Login recipes

Four presets. A recipe answers one question — *how does a browser get from cold start to a
signed-in session in this app* — and nothing else. Everything after that is a step.

| Recipe | For | Credentials it reads |
|---|---|---|
| `none` | public apps, or a dev build with auth disabled | — |
| `form` | any app with its own `<form>` on a sign-in route | `<PREFIX>_EMAIL` (or `_USER`), `<PREFIX>_PASSWORD` |
| `clerk-hosted` | Clerk's hosted sign-in component | same as `form`, plus optional `<PREFIX>_TOTP_SECRET` |
| `storage-state` | SSO, captcha, hardware keys — anything a script must not automate | a saved session file, produced by `--manual-login` |

`<PREFIX>` is the environment name upper-cased with non-alphanumerics folded to `_`, unless
`auth.credentials_prefix` overrides it. `local` reads `LOCAL_EMAIL`; `local-pos` reads
`LOCAL_POS_EMAIL`. There is deliberately **no unprefixed fallback**: a `PASSWORD` that silently
applies to every environment is how a local account ends up signing in to staging.

A blank value is a missing value. Missing values on a required environment are rung 2 of the
ladder — a skip, not a failure. See `verification-protocol.md`.

---

## `none`

```yaml
auth:
  recipe: none
  landing: /
  ready_when: { gone: ".app-loading" }
```

No sign-in. The runner opens the landing URL, waits for `ready_when`, applies `capture`, and
starts stepping. `capture` still works — plenty of public apps route through `/{locale}/…`.

This is the only recipe that can reach rung 3 with an empty credentials file, which makes it
the right choice for a docs site, a marketing page, or a local build with auth stubbed out.

---

## `form`

The general case. You name the three selectors; the runner fills and submits.

```yaml
auth:
  recipe: form
  path: /login                 # default: /login
  landing: /
  selectors:
    user: "input[name=email]"        # default: input[type=email], input[name=email], input[name=username]
    password: "input[type=password]" # default: input[type=password]
    submit: "button[type=submit]"    # default: button[type=submit]
  ready_when: { gone: "text=Signing in" }
```

The defaults are a chain of candidates tried in order, so most apps need no `selectors` block at
all. Name them when the page has two forms, when the submit button is not a `<button>`, or when
the first candidate matches something invisible.

Success is defined as *leaving the sign-in route* and reaching `landing`. An app that answers a
bad password by re-rendering the same route therefore fails correctly without needing an
error-message selector. An app that stays on the route while showing a spinner needs a
`ready_when` that waits for the spinner to go.

**Two-step forms** — identifier on one screen, password on the next — are a `form` with an
extra hop:

```yaml
    submit: "button:has-text('Continue')"
    password_submit: "button:has-text('Sign in')"
```

When `password_submit` is set, the runner submits after the identifier, waits for the password
field, fills it and submits again.

---

## `clerk-hosted`

Clerk's hosted component, which is a two-step form with stable field names:

```yaml
auth:
  recipe: clerk-hosted
  path: /sign-in
  landing: /
  capture: /{tenant}/*
```

Defaults, all overridable through `selectors`:

| Slot | Default |
|---|---|
| `user` | `input[name=identifier]` |
| `submit` | `button:has-text("Continue")` |
| `password` | `input[name=password]` |
| `password_submit` | `button:has-text("Continue")` |
| `totp` | `input[name=code]` |

If `<PREFIX>_TOTP_SECRET` is set, the runner derives the six-digit code itself (RFC 6238,
30-second window, SHA-1) and fills it. The secret is the base32 string the enrolment QR encodes
— the same one an authenticator app holds. Store it in `.ai/credentials.env` like any other
credential, and be aware of what it means: a machine with that secret can complete the second
factor unattended, which is precisely why it belongs to a dedicated verification account and
never to a personal one.

Without the secret, an account with TOTP enforced lands on `/factor-one` or `/factor-two`, which
are in the default `interactive_paths` — so it fails immediately with a pointer to
`--manual-login` rather than sitting in a timeout.

Clerk's default `interactive_paths`: `/factor-one`, `/factor-two`, `/verify`, `/sso-callback`,
`/continue`, `/reset-password`.

---

## `storage-state`

No automated login at all. The runner loads a Playwright storage state — cookies and local
storage — saved earlier by a human.

```yaml
auth:
  recipe: storage-state
  landing: /
```

```bash
verify.py .ai/features/<slug> --manual-login --env staging
```

That opens a headed browser at the environment's URL, waits while you sign in by hand, and
writes `.ai/.auth/<env>.json` when you press Enter. Nothing is read from `.ai/credentials.env`
on that path, and nothing about how you authenticated is recorded.

For this recipe the saved file *is* the credential: `--doctor` reports the environment as
configured when it exists and as skipped when it does not. Sessions expire, so a run that finds
the file but lands on a sign-in route fails with `saved session expired — re-run
--manual-login`, which is a different message from "wrong password" on purpose.

This is the correct recipe for SSO through an identity provider, for anything behind a captcha,
and for accounts secured with a hardware key. Do not try to automate those; a recipe that
half-works against an IdP is worse than an honest manual step, because it fails differently
every sprint.

### Saved sessions work with the other recipes too

Any recipe will reuse `.ai/.auth/<env>.json` when it exists, and fall back to its own login
when the session turns out to be expired. That is what makes a ten-environment run fast on the
second attempt. `--manual-login` on a `form` environment is therefore also the escape hatch for
"the login page changed and my selectors are stale" — it unblocks today's evidence while you
fix the config.

---

## `post_login`

Every recipe accepts it. Same four verbs as a step's `Interaction` column, run once per
environment after login and before the first step:

```yaml
auth:
  recipe: form
  post_login: "click button:has-text('Skip tour'); click [data-test=accept-cookies]"
```

For the modal that greets a fresh session — a product tour, a cookie banner, a "what's new"
dialog. Each action is best-effort: an element that is not there is not an error, because the
tour only appears the first time. Anything that must be present belongs in a step, where a
missing element is a real failure.

Navigation does not belong here. `post_login` is for dismissing things, not for getting
somewhere.

---

## Choosing

Start at `none` and stop at the first row that is true:

1. The app has no login, or your dev build stubs it → **`none`**.
2. Sign-in is a form you control and a password is enough → **`form`**.
3. It is Clerk's hosted component → **`clerk-hosted`**.
4. Anything else — SSO, captcha, hardware key, an IdP you do not control →
   **`storage-state`** with `--manual-login`.

Do not write a fifth recipe into the config by chaining `post_login` actions through a login
flow. If a real app needs a recipe that is not here, add it to `scripts/runner/run.py` where
the others live, so its failure modes are named the same way — a login flow expressed as a
string of `click` verbs in a YAML file cannot report *why* it failed, and "step S1 timed out"
is the least useful sentence this tool could produce.
