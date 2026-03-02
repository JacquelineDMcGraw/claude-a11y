# Calling screen reader users: help test Claude A11y

I'm building [Claude A11y](https://github.com/JacquelineDMcGraw/claude-a11y) — an open-source project that formats AI chat responses for screen readers (NVDA, JAWS, VoiceOver, Orca).

Right now, when Claude sends a response with code blocks, tables, or markdown formatting, screen readers get a wall of raw syntax — backticks, pipe characters, pound signs. Claude A11y transforms those into clear announcements: `[Python] print('hello') [End Python]`, `[Table, 3 columns, 2 rows]`, `[Heading] Section Title`.

It works as a **Chrome extension** (for claude.ai), a **VS Code extension**, and a **CLI wrapper**.

## I need help from people who actually use screen readers daily

Specifically:

- Are the announcements clear? Is `[Python]` better or worse than `Python code block`?
- Does navigation work? Can you jump between AI responses, headings, table cells?
- What's missing? What does your screen reader choke on that I haven't addressed?
- What's too verbose? Are there announcements you'd want to turn off?
- Does the new Raw/Accessible toggle per response work for you as an escape hatch?

## How to help

1. Install from source (instructions in the [README](https://github.com/JacquelineDMcGraw/claude-a11y#quick-start)) or grab the Chrome extension from the repo
2. Try it with Claude for 10-15 minutes of real usage
3. File an issue using the [Screen Reader Test Report](https://github.com/JacquelineDMcGraw/claude-a11y/issues/new?template=screen-reader-test-report.md) template — or just tell me what broke

Even a 2-minute "I tried it with NVDA and X was confusing" is incredibly valuable. I don't use a screen reader full-time, so I'm building this with assumptions that need to be checked.

## What's customizable

Three verbosity levels (minimal, normal, detailed) control how much annotation you hear. A Raw/Accessible toggle on each response lets you turn off annotations for any individual message. Use Alt+Up/Alt+Down to jump between responses with your screen reader.

## Where to post feedback

- [GitHub Issues](https://github.com/JacquelineDMcGraw/claude-a11y/issues) — use the Screen Reader Test Report template
- [GitHub Discussions](https://github.com/JacquelineDMcGraw/claude-a11y/discussions) — for broader feedback or questions
- Pull requests welcome — the project is MIT licensed and the codebase is documented

Thanks.
