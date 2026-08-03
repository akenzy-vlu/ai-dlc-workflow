# UTSer Flutter conventions

Read this when writing tickets (Phase 3) and when closing out (Phase 5). These are the
repo's actual rules — a ticket that violates them will fail review regardless of whether
the feature works.

## Layer boundaries

| Layer        | May import                     | Must not                                         |
| ------------ | ------------------------------ | ------------------------------------------------ |
| Domain       | `dartz`, pure Dart             | Any `package:flutter/*`, any model, any API type |
| Data         | Domain, http/dio, drift        | BLoC, widgets                                    |
| Presentation | Domain, `utse_ui_kit`, flutter | Data sources directly — only UseCases            |

The domain-has-no-Flutter-import rule is the load-bearing one. It is what keeps use cases
unit-testable without a widget tester, which is what makes tickets independently verifiable.

## BLoC shape

- Sealed `<Feature>State` with `Initial` / `Loading` / `Loaded` / `Failure` variants
- Sealed `<Feature>Event`, handlers registered via `on<Event>(_handler)` in the constructor
- Every `Either` resolved with `.fold()` — an ignored `Either` is a swallowed error
- `Failure` state stores `final Failure failure`, never `final String message`.
  A pre-formatted string in state means the UI cannot branch on failure type, and
  retryability is lost.

```dart
result.fold(
  (failure) => emit(RegistrationFailure(failure)),
  (courses) => emit(RegistrationLoaded(courses)),
);
```

## Page composition

Split by state rather than growing one build method:

```
registration_page.dart      // BlocBuilder + switch over state
_initial.dart               // AppSkeletonShell + AppSkeletonBox, or AppLoading()
_loaded.dart
_failure.dart               // AppErrorState(failure: failure, onRetry: ...)
```

`_failure.dart` uses `AppErrorState` — never a bespoke error widget. Consistent error
presentation is the whole reason the shared widget exists.

## Reuse before you build

Check `packages/utse_ui_kit/lib/widgets/` before creating any widget. Current inventory:

`AppSectionHeader` · `AppFilterChip` · `AppBadgeChip` · `AppFooterActions` ·
`AppDetailRow` · `AppMetaField` · `AppAvatar` · `AppErrorState` · `AppEmptyState` ·
`AppLoading` · `AppSkeletonShell` · `AppSkeletonBox` · `AppQuickAccessCard` ·
`AppButton` · `AppActionButton` · `AppInput` · `AppScaffold`

If a new shared widget is genuinely needed, it gets its own ticket with
`layer: presentation`, `type: chore`, and lands in `utse_ui_kit` — not in the feature folder.

## Banned in presentation code

| Do not use                                   | Use instead                                                 |
| -------------------------------------------- | ----------------------------------------------------------- |
| `ElevatedButton`, `TextButton`               | `AppButton`, `AppActionButton`                              |
| `TextField`                                  | `AppInput`                                                  |
| raw `Scaffold`                               | `AppScaffold`                                               |
| `Colors.*`, hex literals                     | theme tokens                                                |
| `Padding()`, `Center()`, `GestureDetector()` | `.paddingAll()`, `.center()`, `.onTap()`                    |
| raw numeric sizes                            | `appSpacing.*`, or `.w` / `.h` / `.r`                       |
| hardcoded route strings                      | `segmentOf('<route-key>')` via `NavigationManagerInterface` |

## Definition of Done

Run at the close of every UoW (gate G4) and again at G5.

**Architecture**
- [ ] No Flutter import anywhere in domain
- [ ] No API call inside a BLoC — UseCases only
- [ ] Every `Either` handled with `.fold()`
- [ ] Failure state holds a `Failure` object, not a `String`

**UI**
- [ ] All four states render: loading, loaded, empty, failure
- [ ] `AppErrorState` used for failures, with a working retry
- [ ] No banned widget or raw literal from the table above
- [ ] Routes go through `segmentOf()`

**Tests**
- [ ] UseCase unit tests pass with a mocked repository
- [ ] Data-layer tests cover each failure mapping in the error taxonomy
- [ ] Every AC listed in the UoW's `verifies` has a test that would fail if the behaviour broke

**Plan hygiene**
- [ ] Ticket frontmatter `status` updated to `done`
- [ ] `python scripts/uow_graph.py .ai/features/<slug> --write` re-run
- [ ] Any assumption this work resolved is marked `confirmed` or `rejected`
- [ ] Decisions made mid-construction folded back as ADRs
