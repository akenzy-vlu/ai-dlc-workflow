---
feature: skill-file-viewer
adr_count: 3
---

# Logical design — Skill File Viewer

## Approach

Two new read-only endpoints join `apps/api/src/contexts/skills/interface/skills.controller.ts`:
one lists a skill's files, one reads one file's content. Both are backed by a new use case
that reuses `listPackageFiles()` (`skill-digest.ts`) for enumeration and adds a
`readPackageFile()` sibling function guarded against path traversal (ADR-02). Neither
touches `SkillCatalogPort`, `SkillInstallerPort`, or the install flow — this is a pure
read addition alongside the existing inventory/install use cases.

On the web side, the Skills page row gains a click handler that opens a new
`SkillFileDrawer` (container/view/props triad mirroring `agent-run-drawer`) via local
`openSkillId` state (ADR-01). The drawer composes a file-tree panel (Ant Design `Tree`,
already a dependency) and a content-viewer panel that branches on the selected file's
extension: `.md` renders through `react-markdown` with a Preview/Plain-text toggle
(AC-04); anything else renders as syntax-highlighted text via `highlight.js` (AC-05);
binary or oversized files render a placeholder instead of content (AC-06, AC-07)
(ADR-03). The existing Install/Sync button in each row keeps its own click handler with
propagation stopped, so opening the drawer and installing/syncing remain independent
actions on the same row (AC-09).

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Dedicated routed page (mirroring `feature-detail-page`, closer to the reference screenshot) | Confirmed against by the feature owner during planning interrogation: a full page/route is unnecessary surface for a read-only viewer when the row-launched drawer precedent already fits (ADR-01) |
| Shiki instead of `highlight.js` | Heavier dependency and extra setup (theme/language loading) for marginal fidelity gain on a plain read-only view; confirmed against during planning interrogation (ADR-03) |
| Serve file bytes over a generic/static file route | Bypasses the per-skill `sourcePath` traversal guard the security constraint requires; every read must go through the id → `sourcePath` resolution `SkillCatalogPort` already owns |
| Fold the file list into the existing `GET /api/skills` response | Turns a lightweight catalog listing (`fileCount` today) into a heavy per-file payload on every page load, when the tree is only needed once a user opens a skill |

## Domain model

| Entity | Fields | Notes |
| --- | --- | --- |
| `SkillFileNode` | `relativePath`, `name`, `isDirectory`, `extension`, `size` | Derived from `listPackageFiles()`'s flat, sorted `{ relativePath, absolutePath }[]`; nested into a tree client-side, the same place `Tree` already expects `children` |
| `SkillFileContent` | `relativePath`, `content`, `encoding` (`'utf8' \| 'binary'`), `truncated`, `size` | `encoding: 'binary'` with no `content` drives the "preview not available" placeholder (AC-07); `truncated: true` drives the oversized-file notice (AC-06) |

## Contracts

### `GET /api/skills/:id/files`

Response: `SkillFileNode[]` — flat and sorted, same ordering `listPackageFiles()` already
produces; the client nests it into a tree.
`404` if `id` is not a known skill.

### `GET /api/skills/:id/files/content?path=<relativePath>`

`path` is a query parameter, not a route segment — a segment would swallow the `/` inside
paths like `references/methodology.md`, the same reasoning `portfolio.controller.ts`
already applies to its own `?path=` parameter.

Response: `SkillFileContent`.
`400` (`RefusedError`) if the resolved path escapes the skill's own `sourcePath`
(ADR-02, AC-08).
`404` if `id` is unknown or the resolved file does not exist.

## Error taxonomy

| Case | Where caught | Surface |
| --- | --- | --- |
| Unknown skill id | use case, via `SkillCatalogPort.find` | `404` → drawer shows "skill not found" |
| Path traversal attempt | use case, resolve + prefix check (`RefusedError`) | `400` → shown identically to a generic fetch failure; never distinguished for the user, since only a crafted request produces it |
| File missing (e.g. deleted between list and read) | use case, `ENOENT` on `fs.readFile` | `404` → viewer shows "file not found", suggests refreshing the tree |
| File exceeds the size cap | use case, checked while reading | `200` with `truncated: true` (AC-06) — a degraded-but-successful response, not an error |
| File is not valid text | use case, content sniff | `200` with `encoding: 'binary'`, no `content` (AC-07) — not an error |
| File-list request fails (network/5xx) | web data layer | `AC-02` error state with retry |

## ADRs

### ADR-01 — Skill detail is a drawer opened from the Skills page row, not a routed page
**Status:** accepted

**Context:** The Skills page has no click behavior on a row today. Two "detail" shapes
exist elsewhere in this codebase: `agent-run-drawer` (local-state-driven overlay) and
`feature-detail-page` (a routed page with panels). The reference screenshot supplied with
this request showed a full-page layout — breadcrumb, sidebar file tree, content panel —
which could be read as favoring the page shape.

**Decision:** Use a slide-over drawer opened from `openSkillId` local state on
`skills-page.tsx`, mirroring `agent-run-drawer`'s exact shape: a
container/view/props triad, an Ant Design `Drawer`, an `onClose` callback.

**Consequence:** No new route or breadcrumb; the file tree and content viewer share the
drawer's width, narrower than the reference screenshot's full page. Acceptable because
this is a read-only viewer, not a workspace. Confirmed by the feature owner during
planning interrogation (2026-08-29) over the routed-page alternative.

### ADR-02 — File-content reads are anchored to the skill's own sourcePath with an explicit prefix check
**Status:** accepted

**Context:** This feature introduces the first client-influenced relative path into the
skills context — every existing skills endpoint only ever reads paths it discovered
itself via `fs.readdir` on a trusted root (`filesystem-skill-catalog.ts`), never a path a
request supplies.

**Decision:** The new content-read use case resolves the skill id to `sourcePath` via
`SkillCatalogPort.find`, joins the requested relative path, resolves the result with
`path.resolve`, and requires it to equal `sourcePath` or start with
`sourcePath + path.sep` — the same idiom `browse-directories.query.ts` already applies
against `config.browseRoots` — refusing with `RefusedError` otherwise.

**Consequence:** Any `../` escape, symlink escape, or absolute-path override is refused
before a filesystem read happens (AC-08). The guard is a small, directly-testable
function anchored to a single package path rather than a list of roots, so it is not a
drop-in reuse of `browse-directories.query.ts` — it is the same idiom applied to a
narrower boundary, worth copying rather than importing.

### ADR-03 — react-markdown and highlight.js are new apps/web dependencies
**Status:** accepted

**Context:** Neither a markdown renderer nor a syntax highlighter exists in `apps/web`
today; no feature in this app has ever rendered markdown or highlighted code.

**Decision:** Add `react-markdown` for the Preview/Plain-text toggle (AC-04) and
`highlight.js` for syntax-highlighting non-markdown text files (AC-05).

**Consequence:** Two new runtime dependencies land in `apps/web/package.json`. Confirmed
by the feature owner during planning interrogation (2026-08-29) over Shiki and over
shipping no highlighting at all.
