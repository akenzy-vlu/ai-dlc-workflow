---
feature: skill-file-viewer
slug: 2026082902-skill-file-viewer
owner: Akenzy
created: 2026-08-29
status: draft
---

# Intent — Skill File Viewer

## Problem

The console's Skills page (`apps/web/src/presentation/pages/skills-page/`) lists every
skill package the repo ships — `ai-dlc-core`, `ai-dlc-verify`, `profile-flutter` — with a
name, description, file count and per-repo install status. Today that row is a dead end:
there is no click handler on it at all (`skills-page.view.tsx` columns have no `onRow`),
so the only way to see what a skill actually contains — its `SKILL.md`, its
`references/*.md`, its `scripts/*.py` — is to leave the console and open the filesystem
directly. A user deciding whether a skill is safe to install, or trying to understand what
a script does before running it, has no way to check from inside the tool that already
knows the skill exists and already counts its files.

## Affected personas

| Persona                          | Current behaviour                                                    | Desired behaviour                                                             |
| --------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Console user browsing Skills page | Opens a terminal/editor on the skill's source path to read its files | Clicks the skill in the console and reads every file in its package in place |

## Success signal

Every file inside a listed skill's package (`SKILL.md`, everything under `references/`,
`scripts/`, and any other file `listPackageFiles` enumerates) is readable from the Skills
page without leaving the console: a user can open a skill's detail view, browse its file
tree, and read the content of any file in it — `.md` files rendered with a Preview/Plain
text toggle, `.py` and other source files shown as readable text — with zero need to open
a terminal or editor to inspect a skill package.

## Out of scope

- **Editing or saving skill files from the console.** This is a read-only viewer; the
  request is "user can be read it", not "user can edit it". Editing a skill's source is a
  separate concern from viewing it, and the console today has no write path to `skills/`
  or `examples/` beyond the install copy.
- **Diffing an installed copy against its source package.** The viewer shows one copy —
  the source package (`skill.sourcePath`) — not per-installation-target contents, even
  though a skill can appear installed at several repos with potentially different digests.
- **Binary file rendering** (images, archives). Skill packages today are text-only
  (markdown, Python, YAML); a non-text file is shown as "cannot preview" rather than
  rendered.
- **Full syntax-aware code intelligence** (go-to-definition, linting, execution). This is
  a read-only file viewer, not an IDE — `.py` files get readable, monospaced/highlighted
  text, not an editor experience.

## Constraints

| Kind     | Detail                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reuse    | File enumeration must reuse `listPackageFiles` in `apps/api/src/contexts/skills/infrastructure/skill-digest.ts` — the same routine the catalog and installer already share — not a second file-walk |
| Security | Reading a file by relative path is new client-influenced input into this context; must apply the traversal-guard idiom already used in `apps/api/src/contexts/portfolio/application/browse-directories.query.ts` (resolve, then require the result to stay under the skill's own `sourcePath`) |
| Platform | No markdown renderer or syntax highlighter exists in `apps/web` today (`package.json` has neither `react-markdown` nor any of `highlight.js`/`shiki`/`prismjs`/`monaco`) — this feature is what introduces that dependency to the web app |
| Testing  | `apps/web` ships with zero automated tests today — no test runner is wired into `apps/web/package.json`, no `*.spec.*`/`*.test.*` file exists anywhere under it (`pnpm test` only runs `apps/api`'s vitest suite, per this repo's own CLAUDE.md). Web tickets are verified by manual demo against the running app, matching existing repo convention; introducing a web test runner is out of scope here. `apps/api` tickets keep the existing vitest, no-I/O convention |

## Existing surface touched

- Reused components/logic: `listPackageFiles()` (`skill-digest.ts`) for enumeration;
  `SkillCatalogPort.find(id)` to resolve a skill id to its `sourcePath`; the
  traversal-guard idiom from `browse-directories.query.ts`; Ant Design's `Tree` component
  (already a dependency via `antd`, no new package needed for the file tree itself).
- Adjacent features: `agent-run-drawer`
  (`apps/web/src/presentation/features/agent-launcher/agent-run-drawer/`) is the
  codebase's only existing "detail" precedent — a container/view/props triad opened from
  parent-page local state (`openRunId` + `<Drawer runId=.. onClose=..>`), not URL-driven;
  `feature-detail-page` (`apps/web/src/presentation/pages/feature-detail-page/`) is the
  only existing full-page-with-panels precedent, reached via a route param. Neither is a
  file browser today, and no markdown rendering exists anywhere in the app yet — the
  closest text-rendering precedent (`intent-panel.view.tsx`) shows section bodies as raw
  `<pre>` text, not rendered markdown.
- Entry points: the Skills page row itself (`skills-page.view.tsx` columns, currently
  inert) gains the new entry point; two new read-only API routes under
  `apps/api/src/contexts/skills/interface/skills.controller.ts` (list a skill's files,
  read one file's content).
