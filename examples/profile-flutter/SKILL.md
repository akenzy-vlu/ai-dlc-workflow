---
name: profile-flutter
scope: project
description: EXAMPLE stack profile for a sample Flutter monorepo — the repo containing apps/sample_app and packages/sample_ui_kit / sample_domain / sample_core. Supplies the repo inventory script, the BLoC and layer conventions, the sample_ui_kit reuse inventory, and the definition-of-done used when planning or implementing features there. Use together with ai-dlc-core whenever work targets a monorepo with those exact path markers: planning a feature, decomposing tickets, reviewing a Flutter BLoC or page against house style, or checking a change against the definition-of-done. This is a reference implementation of the profile contract, not a profile shipped for real use — copy it and replace the names with your own before pointing it at a real repo.
---

# Profile — Flutter monorepo (EXAMPLE)

A stack profile. The workflow, the gates and the controller come from **`ai-dlc-core`** —
read its SKILL.md first and run `aidlc status` before anything else. This file supplies only
what is specific to this monorepo.

## Applies to

The monorepo containing `apps/sample_app/` and `packages/sample_ui_kit/`, `packages/sample_domain/`,
`packages/sample_core/`. If those paths are not present, this is the wrong profile.

## Discovery

```bash
python scripts/discover_repo.py <repo-root> -o .ai/architecture.md
python scripts/discover_repo.py <repo-root> --feature <closest-existing-feature>
```

Detects: packages, state management, DI, networking, local database, routing, existing
features and their layers, the `sample_ui_kit` widget inventory, `segmentOf()` route keys, and
the naming conventions actually in use.

The output has an empty `verified_by` field. G0 will not pass until a human fills it — read
the draft and correct it first, because filename heuristics cannot tell a live convention
from a legacy one. The one that catches people here: `sample_domain` exists, but several
features keep their domain code inside `apps/sample_app` anyway. Check which applies before
writing `touches` paths.

## Configuration

`.ai/aidlc.yaml`:

```yaml
profile: profile-flutter
layers: [domain, data, presentation, infra, test]
```

## Conventions and definition of done

`references/flutter-rules.md` — layer boundaries, BLoC shape, page composition, the
`sample_ui_kit` reuse inventory, the banned-construct table, and the DoD checklist.

Read it when writing tickets (Phase 3) and again when closing a UoW (G4) or the feature (G5).
The DoD is the part that earns its keep: it is specific enough to fail.

## Shell output: rtk

[`rtk`](https://github.com/rtk-ai/rtk) is a token-filtering CLI proxy. Reading a monorepo is where a profile spends
its context, so prefer `rtk tree`, `rtk find`, `rtk grep` and `rtk read` over their native
equivalents when it is installed, and `rtk test` for the suite. It is **optional** — fall
back to the native command when `rtk` is not on `PATH`.

Do not filter the output of `aidlc`, `uowg` or this profile's `discover_repo.py`: the first
two are gate verdicts and the third is a draft a human has to sign.

## Notes for this repo

- **Reuse before you build.** Check `packages/sample_ui_kit/lib/widgets/` first. A genuinely
  new shared widget gets its own `type: chore` ticket and lands in the kit, never in a
  feature folder.
- **Domain purity is load-bearing.** No `package:flutter/*` import in domain — that is what
  keeps use cases testable without a widget tester, which is what makes tickets
  independently verifiable at G4.
- **`Failure`, not `String`.** A pre-formatted message in state means the UI cannot branch on
  failure type and retryability is lost.
- **Store review is a real constraint.** Permission declarations and credential handling have
  rejected builds before; treat them as G2 design concerns, not implementation details.
