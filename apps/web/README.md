# kiln — Web

React 19, Vite, **Ant Design 6.6.1**, TanStack Query, socket.io-client.

## The theme system

`assets/` holds the brand kit and is the source of truth: `BRAND.md` for the rules,
`theme.css` for every colour, radius, spacing step and duration as CSS custom properties,
`tokens.json` for the same values as data, and the logo set.

`src/app/theme.ts` mirrors those values into Ant Design's token API — the algorithm needs
literal colours at build time, not `var()` references. Where the two could drift,
`theme.css` wins and `theme.ts` follows it.

**Three neutrals, one accent.** Graphite is a warm neutral, not a cool grey; swapping it
for `#000` or a stock slate is exactly what makes a system look like a template. Amber is
the only saturated colour in the app, and it means one thing:

> **this is where a person has to look.**

That maps onto AI-DLC almost too neatly. A gate whose preconditions pass and needs
approval is amber. A ticket in review is amber. A blocking assumption nobody has answered
is amber. An agent mid-run is *not* — it is activity, not attention, and it stays
graphite. So does finished work.

The consequence is deliberate: on a healthy board the screen is nearly monochrome, and
the amber is the thing to walk to. If nothing is waiting on you, there is no amber. That
is the feature — do not add colour to make a quiet screen look busier.

Two rules that are easy to get wrong:

- **Amber-500 is a fill, not a text colour.** It is 1.5:1 on a light background. Text and
  links use amber-800 (`accent.text`); text sitting *on* an amber fill uses amber-900,
  never white. Both are wired into the Ant tokens (`colorLink`, `Button.primaryColor`).
- **Amber is never a warning.** `semantic.warning` is a separate earth orange for exactly
  that reason — if amber also meant "something is wrong", the approval signal would be
  gone. `semantic.success` is a muted sage used in very small doses: a status dot, a check
  glyph, never a filled area.

Critical path is expressed as **weight**, not hue — a heavier left border — because it is
important but it is not something waiting on a person, and a second saturated colour would
compete with the one that is.

### Reading colour in a component

Components import role tokens, not ramp positions:

```tsx
import { accent, semantic, token } from '@app/theme';

<span style={{ color: token.textSecondary }} />
```

`token.*` resolves to a CSS custom property, so it flips with the theme on its own. A ramp
position cannot: `graphite-100` is a hairline border on light and invisible on dark.

### Light and dark

`ThemeProvider` writes `data-theme` on `<html>` — which is what `assets/theme.css` switches
on — and hands Ant Design the matching algorithm, so the custom properties and the
component tokens always agree about which mode is showing. The initial resolution runs in a
blocking script in `index.html`, before React mounts; doing it in React flashes a white
screen at every dark-mode load.

The preference is light, dark, or **follow the system** — three states, not a toggle,
because "follow the system" is a real preference and flipping to dark at dusk is the OS's
job.

### Type

Inter Tight for UI and headings, Inter for body, JetBrains Mono for code and figures,
installed via `@fontsource-variable` so the app works offline. Only weights 400 and 500 —
with a warm neutral, 600 and 700 read heavy and dated. Headings at 28px and up carry
`letter-spacing: -0.02em`.

## Structure

Feature-sliced, and layered the same way round as the API: each layer may import from the
ones below it, never above.

```
app/        router, layout, theme            — composition root
pages/      one screen each                  — compose everything below
features/   interactive units with their own state (gate actions, ticket actions, identity,
            agent launcher, view controls)
entities/   domain display components (GateTag, GateTimeline, TicketStatusTag)
shared/     api client, types, formatting, UI primitives
```

The API's response shapes are mirrored by hand in `shared/types/`. The surface is small,
and writing the type by hand is where a field that means nothing to the UI gets noticed.

## Keyboard

`⌘K` (or `Ctrl+K`) opens search from anywhere; `c` starts a new feature when the focus is
not in a field. Two shortcuts, no more — past that they start colliding with typing.

## Two decisions worth explaining

**The Inbox is home, not the portfolio.** Opening on a table of a hundred and twenty rows
answers "what exists" when the question people arrive with is "what is waiting on me".

**Every controller call shows its output verbatim**, in a modal, with the command that
produced it. A refusal from `aidlc.py` usually names the file to go fix — "00-intent.md
still has 4 TODO placeholder(s)" — so paraphrasing it into "Action failed" throws away the
only useful part. Showing the command means the user can re-run it in a terminal and get
the same answer, which is the difference between a tool they can trust and a black box.

## Filter and Display

`features/view-controls/` is shared by every list view. Filters are `property · operator ·
values` triples: values inside one filter are ORed, filters on different properties are
ANDed. That is what "status is todo or review, layer is api" means said out loud, and
getting it the other way round produces empty boards that look like bugs.

Filter and display state is kept in `localStorage`, per view — not in the URL. The URL is
for addressing a *thing*, and a link someone shares should open on the feature, not on the
sender's private column layout.

## Identity

There are no accounts. The name in the top-right is kept in `localStorage` and sent as
`--by` on every write. It is deliberately not defaulted to the hostname or to "console":
that string lands in an append-only trail inside the repo, and on checkouts that do not
commit `.ai/` it is the only record that a person approved anything. A plausible-looking
default would be a fake signature on a real approval.

The API decides how much that name is worth. `GET /api/maintenance/status` returns an
`identity` block saying either `client` (whatever the browser sent — fine for one person,
not evidence for a team) or `trusted-header` (an authenticating proxy supplies it and the
body is ignored). The console models that field but does not yet show it anywhere. Until
it does, a reader of the approval trail cannot tell which of the two they are looking at.

## Evidence archive

`evidence/` is gitignored and `evidence-manifest.json` is not, and the whole panel exists
because of that asymmetry. Screenshots live only on the machine whose browser produced
them; the manifest — path, sha256, size, one line per file — is small, textual, and meant
to be committed next to the plan. So a teammate who pulls the repo can read exactly what
G4 was approved against, and cannot open a single pixel of it.

That is why `missing` is the number the panel leads with. `5 of 5 present` and `3 of 5
present` are not two shades of the same status: the second means this feature's G4 rests
on screenshots nobody here can look at, and reporting both in the same neutral tone would
bury the only case a reviewer needs to catch. Missing rows are dimmed rather than
coloured — they are still real evidence, just evidence you cannot open.

The store is content-addressed (`<consoleHome>/evidence-cas/ab/abcd….png`), so a blob is
named by its own hash. Deduplication is a side effect rather than a feature, and the bytes
can be served `immutable` because a given hash can only ever mean one file. The panel also
compares the manifest's `capturedAt` against the last run's finish time and says so when
the manifest describes an older run than the one currently on disk.

## Commands

```bash
pnpm dev           # http://localhost:5173, proxying /api and /events to :7777
pnpm build
pnpm typecheck
```

The dev server proxies to the API so the browser stays same-origin and CORS never enters
the picture. Point it elsewhere with `VITE_API_URL`.

Path aliases are declared twice — `tsconfig.json` for the type-checker and
`vite.config.ts` for the bundler. They have to be kept in step; a mismatch shows up as a
build that type-checks and will not run.

## Colour means something

`app/theme.ts` is the only place a semantic colour is defined. Amber always reads as "not
accepted yet", magenta always as "on the critical path", and the G0…G5 ramp walks cool to
warm so a gate badge reads as progress. A reader should never have to relearn the palette
between two screens.
