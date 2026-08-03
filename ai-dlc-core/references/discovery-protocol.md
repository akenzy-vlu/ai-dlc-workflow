# Discovery protocol

Read this at the start of Phase 0, before asking the user anything.

Two different kinds of unknown show up at the start of a feature, and confusing them
wastes everyone's time:

- **Discoverable** — the repo already answers it. Package names, existing components, route
  keys, DI style, layer conventions, whether a similar feature exists. Asking a human
  these is asking them to read their own code out loud to you.
- **Undiscoverable** — no file contains it. Intent, business rules, priorities, which
  external contracts are settled, what is deliberately excluded. Guessing at these is how
  a plan ends up solving the wrong problem beautifully.

The rule: **discover first, then ask only what discovery could not reach.** Every question
you ask that the repo already answered spends credibility you will need later for the
questions that matter.

---

## Step 0a — Architecture discovery

### Run the inventory

```bash
# with a stack profile
python <profile>/scripts/discover_repo.py <repo-root> -o .ai/architecture.md
python <profile>/scripts/discover_repo.py <repo-root> --feature <closest-existing>

# without one — any stack
python scripts/discover_generic.py <repo-root> -o .ai/architecture.md
```

The output is a **draft**, not truth. The heuristics guess from filenames and manifest
entries; they cannot tell a live convention from a legacy one. Read it and fix what is
wrong before anything downstream leans on it.

### Reuse or refresh?

`.ai/architecture.md` is repo-level and shared across features, so it is usually already
there. Regenerate it when:

- it has no `verified_by` value — nobody has checked it yet
- it is more than ~30 days old, or predates a refactor you know happened
- the feature touches an area the map covers thinly

Otherwise read the existing one. Regenerating a verified map and discarding a human's
corrections is worse than not running the script at all.

### Read past the inventory

The discovery script counts things. It cannot judge them. Before Step 0b, look at the
closest existing feature yourself and answer:

| Question | Where to look |
|---|---|
| Does shared code live in the shared package, or is it duplicated per feature? | The focus listing — do not assume a shared package is used just because it exists |
| How are failures modelled and mapped? | The failure files, and one datasource |
| What does a state holder / service / handler here actually look like? | The largest existing one of its kind — copy its shape, not the shape you would prefer |
| How are tests structured, and how thoroughly? | The test directory of the closest feature |
| Is there a feature that already does something similar? | Feature list — if yes, plan by analogy and say so |

Two things worth flagging explicitly when you find them:

- **Inconsistency.** If two features do the same thing differently, do not silently pick
  one. Name both and ask which is current. This is the most common source of a plan that
  passes review and then fails code review.
- **Absence.** A missing ui_kit, a missing DI file, no tests in the nearest feature — an
  absence changes the ticket list, and it is easy to overlook because nothing is there
  to see.

### Record what discovery could not settle

Anything the map leaves ambiguous goes into the assumption register in Phase 1, with the
same discipline as any other assumption. "The repo has two candidate packages for domain
code and I picked one" is an assumption, not a detail.

---

## Step 0b — Interrogation

### What to ask

Four questions carry most of the value. Ask them together, in the user's language:

1. What pain does this remove, and for whom?
2. How will we know it worked — one measurable signal?
3. What is deliberately out of scope?
4. Any deadline, release train, or external dependency?

Then add up to three questions specific to what discovery turned up. These are the ones
that earn their place, because you could not have asked them without reading the repo:

> The repo has both a shared domain package and domain code inside the app.
> Which one should this feature use?

> Two existing features map API failures differently. Which is the current convention?

> The dependency this feature needs is absent from the repo. Does adding one need approval?

### How to ask

**Batch, do not interrogate turn by turn.** One message with all of them. A planning
session that costs the user eight round trips will not be run a second time.

**Cap at seven.** If you have more than seven, you are asking things you should be
discovering, or the feature is too big and should be split before planning.

**Make each question answerable in a sentence.** "What is the exact user flow, step by
step?" is homework. Propose the flow you inferred and ask what is wrong with it — a user
correcting a draft is faster and more accurate than a user writing from scratch.

**Say why the question matters.** "If registration is per-child rather than per-account,
`AuthSession` gains a field and the persistence slice changes shape" tells the user which
questions to spend effort on.

### Handling the answer

| What comes back | What to do |
|---|---|
| Full answers | Proceed to Phase 1 |
| Partial answers | Proceed. Everything unanswered becomes an assumption, marked `blocking` if it would force rework |
| "Just do your best" / no answer | Proceed to a **full** plan with the register carrying everything. Do not stall, and do not quietly downgrade the assumptions to facts. A complete plan with nine pending assumptions is useful; a half plan waiting on a reply is not |
| An answer that contradicts the map | The user wins on intent, the repo wins on fact. If they contradict on fact — "we always use X" when the repo does not — surface it plainly and ask which is true |
| A new constraint that changes the shape | Go back to 0a if it touches an area you did not inventory |

**One follow-up round, maximum.** If a second round does not settle it, it belongs in the
register as a blocking assumption to be resolved at gate G1. Endless clarification is a
failure mode that looks like diligence.

### What not to do

- Do not ask permission to start. Discover, ask, and draft in the same turn.
- Do not ask the user to choose between technical options they have no context for. That
  is what the design phase and ADRs are for — propose, with the rejected alternatives shown.
- Do not ask a question whose answer you would not act on differently. If both answers
  produce the same plan, the question is noise.
- Do not treat silence as agreement. Silence is an unresolved assumption, and the register
  is where it goes.

---

## Deriving `touches` paths

Every `touches` entry in a ticket must be either a path that appears in the architecture
map, or a new path that follows a convention the map recorded. Anything else is fiction,
and fiction in `touches` is worse than an empty field: it looks authoritative, it survives
review, and the person who picks up the ticket loses an hour finding out the directory
does not exist.

When a path is genuinely new, state the convention it follows:

```yaml
touches:
  - src/billing/data/billing_repository_impl.ts   # new; matches the orders feature
```

---

## Enforcement

G0 refuses to pass while `.ai/architecture.md` lacks a `verified_by` value, and
`aidlc lint-touches --repo <path>` fails on any ticket path that neither exists nor is
marked new. Discovery is therefore not a step you can decide to skip quietly; it is a
precondition with a check attached.
