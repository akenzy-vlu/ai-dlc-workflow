---
name: profile-utser-flutter
description: Stack profile for the UTSer Flutter monorepo — the repo containing apps/utser and packages/utse_ui_kit / utse_domain / utse_core. Supplies the repo inventory script, the BLoC and layer conventions, the utse_ui_kit reuse list, and the definition-of-done used when planning or implementing UTSer features. Use together with ai-dlc-core whenever work targets this monorepo: planning a feature, decomposing tickets, reviewing a Flutter BLoC or page against house style, or checking a change against the UTSer definition-of-done. Not for other Flutter projects, and not for the VLGO NestJS services or the SIS/UTS One infrastructure repos.
---

# Profile — UTSer Flutter

A stack profile. The workflow, the gates and the controller come from **`ai-dlc-core`** —
read its SKILL.md first and run `aidlc status` before anything else. This file supplies only
what is specific to this monorepo.

## Applies to

The monorepo containing `apps/utser/` and `packages/utse_ui_kit/`, `packages/utse_domain/`,
`packages/utse_core/`. If those paths are not present, this is the wrong profile.

## Discovery

```bash
python scripts/discover_repo.py <repo-root> -o .ai/architecture.md
python scripts/discover_repo.py <repo-root> --feature <closest-existing-feature>
```

Detects: packages, state management, DI, networking, local database, routing, existing
features and their layers, the `utse_ui_kit` widget inventory, `segmentOf()` route keys, and
the naming conventions actually in use.

The output has an empty `verified_by` field. G0 will not pass until a human fills it — read
the draft and correct it first, because filename heuristics cannot tell a live convention
from a legacy one. The one that catches people here: `utse_domain` exists, but several
features keep their domain code inside `apps/utser` anyway. Check which applies before
writing `touches` paths.

## Configuration

`.ai/aidlc.yaml`:

```yaml
profile: flutter-utser
layers: [domain, data, presentation, infra, test]
```

## Conventions and definition of done

`references/flutter-rules.md` — layer boundaries, BLoC shape, page composition, the
`utse_ui_kit` reuse inventory, the banned-construct table, and the DoD checklist.

Read it when writing tickets (Phase 3) and again when closing a UoW (G4) or the feature (G5).
The DoD is the part that earns its keep: it is specific enough to fail.

## Notes for this repo

- **Reuse before you build.** Check `packages/utse_ui_kit/lib/widgets/` first. A genuinely
  new shared widget gets its own `type: chore` ticket and lands in the kit, never in a
  feature folder.
- **Domain purity is load-bearing.** No `package:flutter/*` import in domain — that is what
  keeps use cases testable without a widget tester, which is what makes tickets
  independently verifiable at G4.
- **`Failure`, not `String`.** A pre-formatted message in state means the UI cannot branch on
  failure type and retryability is lost.
- **Store review is a real constraint.** Permission declarations and credential handling have
  rejected builds before; treat them as G2 design concerns, not implementation details.
