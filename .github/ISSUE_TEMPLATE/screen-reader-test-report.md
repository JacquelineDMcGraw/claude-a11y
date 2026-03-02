---
name: Screen Reader Test Report
about: Report your experience testing claude-a11y with a screen reader
title: "[Test Report] "
labels: testing, accessibility
assignees: ''
---

## Environment

- Screen reader: (NVDA / JAWS / VoiceOver / Orca / other)
- Screen reader version:
- Operating system:
- Browser (if Chrome extension): (Chrome / Edge / Brave) version
- Editor (if VS Code extension): (VS Code / Cursor) version
- Package tested: (Chrome extension / VS Code extension / CLI)
- Node.js version (if CLI):

## What you tested

Describe what you did. For example: "Opened claude.ai, asked Claude to write a Python function, read the response."

## What worked well

List anything that was clear, helpful, or correctly announced.

## What was confusing or wrong

Describe any announcements that were unclear, missing, too verbose, or incorrect. Be specific about what the screen reader said versus what you expected.

## Announcement phrasing feedback

The extension uses these announcement patterns. Note any you would change:

- Code blocks: `[Python] ... [End Python]` -- Is this clear? Would you prefer `Python code block` instead?
- Headings: `[Heading] Title` -- Clear or confusing?
- Lists: `[3 item bulleted list]` then `Bullet: item` -- Helpful or too verbose?
- Tables: `[Table: 3 rows, 2 columns]` then `[Row 1] Name: Alice, Age: 30` -- Does this work?
- Quotes: `[Quote] text` -- Clear?

## Navigation experience

- Could you jump between AI responses using landmarks?
- Could you navigate between code blocks, headings, and tables?
- Was anything unreachable or trapped focus?

## Verbosity

- Were there too many announcements? Which ones would you turn off?
- Were there too few? What was missing?

## Raw markdown toggle

Did you find and use the Raw/Accessible toggle button on responses? Was it useful?

## Additional context

Anything else: screenshots of screen reader output, audio recordings, crash logs, suggestions.
