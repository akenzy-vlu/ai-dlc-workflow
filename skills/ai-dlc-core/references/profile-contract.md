# Profile contract

Core ships `scripts/discover_generic.py`, which inventories any stack well enough to pass
G0 — so a profile is never required to get started. What core cannot do is hold an opinion:
it does not know which shared component library to enumerate, which conventions are live
versus legacy, or what "done" means in your codebase. A **profile** supplies that opinion for one
stack: how to inventory the repo, what the conventions are, and what "done" means concretely.

Core is the methodology. A profile is the taste.

## Why the split

The valuable part of a definition-of-done is that it is specific. "No `ElevatedButton`",
"failure state holds a `Failure` object, never a `String`" — these catch real review
comments. Merge five stacks into one shared checklist and it degrades to "write tests",
which catches nothing. So the checklist has to be per-stack, and the methodology has to be
shared, or every bug fix to the methodology has to be applied five times and four copies rot.

## Required layout

```
<profile-name>/
├── SKILL.md                        # thin; defers to ai-dlc-core
├── references/
│   └── <stack>-rules.md            # conventions + definition-of-done
└── scripts/
    └── discover_repo.py            # inventory → draft architecture map
```

### `SKILL.md`

Thin by design. It must:

- state that the workflow, gates and controller come from `ai-dlc-core`
- name the repos it applies to, **with concrete path markers**
- point at its rules file and discovery script

The path markers matter more than they look. Several profiles with similar descriptions will
compete for the same request, and the reliable discriminator is a path that only exists in
one repo — `apps/sample_app`, `packages/sample_*`, `src/*-se`. A description that says only "for
Flutter projects" will be picked for the wrong repo.

### `references/<stack>-rules.md`

Four sections, in this order:

1. **Layer boundaries** — what may import what, and which rule is load-bearing
2. **Component shape** — what a state holder / handler / aggregate looks like *here*,
   copied from the largest existing example rather than from preference
3. **Reuse inventory and bans** — the shared components available, and the constructs that
   fail review
4. **Definition of done** — a checklist, grouped, every line mechanically checkable by a
   human in under a minute

Specific enough that someone unfamiliar with the repo could fail the checklist. If every
line would pass on any codebase in the language, the file is not earning its place.

### `scripts/discover_repo.py` (inside the profile)

Read-only. Emits a draft architecture map to stdout or `-o <path>`. Must produce:

- YAML frontmatter with `generated`, `repo_root`, and an **empty `verified_by`** field —
  G0 refuses to pass until a human fills it, so a profile that pre-fills it breaks the gate
- Packages / modules and their kind
- Detected stack: dependency injection, transport, persistence, testing
- Existing features or modules, with the layers present in each
- Shared components available for reuse
- Entry points: routes, endpoints, or commands
- **Naming conventions actually observed**, with a real example path for each
- A closing "Gaps a human must fill" checklist

Accept `--feature <name>` to list the files of an existing feature, which is how tickets get
real `touches` paths instead of invented ones.

Never write outside the output file. Never require a network. Stdlib only if you can manage it.

## Registering a profile

`.ai/aidlc.yaml` at the repo root:

```yaml
profile: profile-flutter
layers: [domain, data, presentation, infra, test]
```

Then `aidlc init <slug> --profile profile-flutter`, which records the profile in the state
file so later sessions know which rules applied.

## Where the methodology itself bends

Two cases where a profile is not enough and the phase definitions need rewriting:

**Infrastructure repos.** "Demoable vertical slice" is strained for Terraform or Helm work.
The closest honest analog is "one environment reaches a working, verifiable state", which
does hold — but the demo test is weaker, and a profile that pretends otherwise produces
slices nobody can accept. Such a profile should redefine what a UoW is and say so plainly.

**Data and migration work.** A schema migration has no user-visible behaviour until the
consumer changes. Either the UoW spans both, or the demo becomes "the shadow read matches
production for 24 hours" — a real gate, but not the one G4 was written for.

In both cases, override the definition explicitly in the profile rather than quietly
stretching the core wording. A gate that everyone has learned to interpret loosely is worse
than a gate that admits it is different here.
