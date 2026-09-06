---
feature: skill-file-viewer
stories: 3
acceptance_criteria: 11
---

# Requirements — Skill File Viewer

## US-01 — Browse a skill's file tree

As a console user, I want to see a skill's file tree
so that I can find the file I want to read without leaving the console.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Happy path
```gherkin
Given a skill (e.g. ai-dlc-core) is listed on the Skills page
When its file viewer opens
Then I see the full file tree that listPackageFiles enumerates for that skill's
  source package, with SKILL.md selected by default
```

**AC-02** — Fetch failure
```gherkin
Given the file-listing request fails
When the viewer opens
Then I see an error state with a way to retry
And no stale or partial tree is shown as if it succeeded
```

**AC-03** — Noise directories excluded
```gherkin
Given a skill's source package contains ignored paths (__pycache__, .git, node_modules,
  .DS_Store, .venv)
When the file tree renders
Then none of those paths appear, matching the same IGNORED set listPackageFiles
  already applies elsewhere in this context
```

## US-02 — Read a file's content

As a console user, I want to click a file in the tree and read its content
so that I can understand what the skill does without opening a terminal or editor.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-04** — Markdown, rendered by default
```gherkin
Given I select a .md file (e.g. SKILL.md)
When it loads
Then I see it rendered as formatted markdown by default
And a "Plain text" toggle is available that switches to the raw source
```

**AC-05** — Non-markdown source, syntax highlighted
```gherkin
Given I select a non-markdown text file (e.g. scripts/aidlc.py)
When it loads
Then I see its raw content with syntax highlighting for its language
And no Preview/Plain text toggle is shown, since there is nothing to render
```

**AC-06** — Oversized file truncated
```gherkin
Given the selected file exceeds the server-side content size cap
When it loads
Then I see the file truncated with a clear "too large to preview in full" notice
And the request does not fail outright
```

**AC-07** — Non-text file
```gherkin
Given the selected file is not valid text (binary)
When I select it
Then I see a "preview not available for this file type" placeholder
And no raw bytes are rendered into the page
```

**AC-08** — Path traversal refused
```gherkin
Given a file-content request whose relative path resolves outside the skill's own
  source package (e.g. via ../ segments or an absolute path override)
When the API receives it
Then it is refused before any filesystem read of the escaped path happens
And no content from outside the skill's source package is ever returned
```

## US-03 — Open the viewer from the Skills page

As a console user, I want to click a skill on the Skills page
so that its file viewer opens for that skill.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-09** — Open from the row
```gherkin
Given the Skills page lists a skill, possibly across several installation-target rows
When I click the skill's name/row
Then a drawer opens showing that skill's file tree (US-01)
And clicking the existing Install/Sync button in the same row still installs or syncs,
  without also opening the drawer
```

**AC-10** — Close returns to the list
```gherkin
Given the drawer is open
When I close it
Then it closes and the Skills page list is unchanged underneath
```

**AC-11** — One tree per skill, not per installation
```gherkin
Given a skill has multiple installation-target rows (e.g. erp2, erp3, jack-erp)
When I open the viewer from any one of those rows
Then the same single file tree opens — the skill's source package — identical
  regardless of which row's action was clicked
```

## Non-functional

| Kind        | Requirement                                                                                   | Verified by |
| ----------- | ---------------------------------------------------------------------------------------------- | ----------- |
| Security    | Every file-content request is resolved against the skill's own sourcePath and refused if the resolved path escapes it, before any read | AC-08       |
| Performance | Opening the drawer and loading a typical file (SKILL.md-sized, a few KB) completes without a visible stall on a local dev API | AC-01, AC-04 |
