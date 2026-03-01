# claude-accessible

**A screen-reader-friendly interface for Claude Code that translates visual formatting into speech-friendly output.**

Makes [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) fully usable with NVDA, JAWS, VoiceOver, and Orca — and more accessible for anyone who processes syntax differently.

![npm version](https://img.shields.io/npm/v/claude-accessible)
![license](https://img.shields.io/npm/l/claude-accessible)
![node](https://img.shields.io/node/v/claude-accessible)

---

## The Story Behind This

I have Ehlers-Danlos Syndrome, dyscalculia, and ADHD. I understand technology deeply — I can architect systems, reason about problems, and think in abstractions — but raw syntax has always been a wall. Nested brackets, semicolons in the wrong place, the visual noise of code formatting — my brain processes these differently, and for a long time, that meant coding was something I understood but couldn't fully do on my own.

AI changed that for me. Tools like Claude Code gave me the ability to turn my understanding into real, working projects. It bridged the gap between knowing *what* to build and being able to *actually build it*.

But when I looked at how Claude Code works for blind and low-vision developers, I realized they were hitting an even harder version of the same wall. Screen readers would choke on the spinning animations, garble the ANSI color codes, and — worst of all — read code blocks as "backtick backtick backtick python" instead of communicating the actual structure of the response.

The same tool that opened a door for me was keeping it shut for others.

**claude-accessible** is my attempt to open that door wider. It's a prototype, a starting point, and an invitation. If AI-assisted coding can work for someone with dyscalculia who struggles to parse syntax visually, it should absolutely work for someone who can't see the syntax at all.

This tool is useful for blind and low-vision developers who need screen reader compatibility, but it's also useful for anyone who benefits from cleaner, more structured output — people with cognitive processing differences, learning disabilities, or anyone who just finds raw markdown noisy when they're trying to think.

---

## What Problem This Solves

Claude Code's interactive TUI uses ink (React for terminals) which rewrites lines, animates spinners, and emits ANSI escape codes. Screen readers can't handle this — they freeze, garble output, or lose track entirely.

But even in Claude Code's headless mode (`claude -p`), which outputs clean text, there's a deeper problem: **markdown formatting is visual, and screen readers read it literally.**

A sighted user sees a nicely highlighted Python code block. A screen reader user hears:

> "backtick backtick backtick python print open paren quote Hello World quote close paren backtick backtick backtick"

**claude-accessible** solves both problems:

1. **Strips all ANSI/TUI artifacts** — no spinners, no cursor movement, no escape codes
2. **Translates markdown into speech-friendly structure** — using a proper markdown AST parser (remark) to convert visual formatting cues into audio-friendly announcements

The same response becomes:

> "Python. print open paren quote Hello World quote close paren. End Python."

Headings, bold, inline code, lists, tables, links — all transformed from visual syntax into clean structural cues that make sense when read aloud.

---

## Installation

```bash
npm install -g claude-accessible
```

**Requirements:**
- Node.js 18 or later
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/overview) installed and authenticated

## Quick Start

```bash
# Interactive coding session
claude-sr

# Quick question
claude-sr "explain this project"

# Continue last conversation
claude-sr -c "now add tests"

# Piped input
echo "fix lint errors" | claude-sr

# Use specific model
claude-sr --model opus "review this PR"
```

## Try It With Speech

The fastest way to hear the difference on macOS:

```bash
# Pipes claude-sr output through macOS text-to-speech
npm run test:speech

# Or manually with any prompt
./bin/test-with-speech.sh --say "explain how to use git branches"

# Or start VoiceOver and run normally
# Press Cmd+F5 to toggle VoiceOver, then:
claude-sr "explain this project"
```

On other platforms:
- **Windows**: Start [NVDA](https://www.nvaccess.org/download/) (free, open source), then run `claude-sr`
- **Linux**: Press Super+Alt+S to toggle Orca (built into GNOME), then run `claude-sr`

## How the Speech Formatting Works

claude-accessible parses Claude's markdown output into an abstract syntax tree using [remark](https://remark.js.org/), then renders it as speech-friendly plain text:

| Markdown | What a screen reader used to say | What it says now |
|---|---|---|
| `` ```python `` | "backtick backtick backtick python" | "Python" |
| `` ``` `` (closing) | "backtick backtick backtick" | "End Python" |
| `## Heading` | "hash hash Heading" | "Heading. Heading" |
| `**bold text**` | "star star bold text star star" | "bold text" |
| `` `code` `` | "backtick code backtick" | "code" |
| `- list item` | "dash list item" | "Bullet: list item" |
| `> quote` | "greater than quote" | "Quote. quote" |
| `---` | "dash dash dash" | "Separator" |
| `[text](url)` | "bracket text bracket paren url paren" | "text, link: url" |
| Tables | Pipes and dashes | "Table, 2 columns. Header: Name, Age. Row 1: Name: Alice, Age: 30" |

## REPL Mode

Launch `claude-sr` with no arguments for an interactive session:

```
$ claude-sr
Claude Code (Screen Reader Mode)
Type a message and press Enter. Type /help for commands, /exit to quit.

> explain the main entry point
Thinking...
[Tool] Reading file: src/index.ts
The main entry point is src/index.ts. It sets up an Express server
on port 3000 with three routes...
[Done] Response complete. (2 turns, $0.0037 cost)

> /exit
Goodbye.
```

- Session context maintained across turns
- Tool usage announced on stderr
- stdout contains only clean response text — pipe it anywhere

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/new` | Start a new session |
| `/session` | Show current session ID |
| `/cost` | Show accumulated cost |
| `/version` | Show version info |
| `/compact` | Compact conversation context |
| `/clear` | Clear screen |
| `/exit` | Exit (also: `/quit`, Ctrl+D) |

## Flags

All Claude Code CLI flags are passed through:

| Flag | Description |
|------|-------------|
| `-m, --model <model>` | Set model (sonnet, opus, haiku) |
| `-c, --continue` | Continue most recent conversation |
| `-r, --resume <id>` | Resume specific session |
| `--allowedTools <tools>` | Tools to allow without prompting |
| `--permission-mode <mode>` | Permission mode |
| `--system-prompt <text>` | Replace system prompt |
| `--max-turns <n>` | Limit agentic turns |
| `--verbose` | Enable verbose output |
| `--dangerously-skip-permissions` | Skip all permission prompts |

All other claude flags work too — they're forwarded automatically.

## How It Works Under the Hood

1. Spawns `claude -p` with `NO_COLOR=1` and `TERM=dumb` to suppress visual formatting at the source
2. Parses stream-json output to extract text content and tool activity
3. Strips any remaining ANSI escape codes (defense in depth)
4. **Parses the response markdown into an AST** using unified/remark
5. **Walks the syntax tree** and renders each node as speech-friendly text
6. Writes clean output to stdout, tool announcements to stderr
7. Maintains session context across turns via `--resume`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CLAUDE_SR_PROMPT` | Custom prompt character (default: `"> "`) |
| `CLAUDE_SR_ANNOUNCE` | Set to `"0"` to suppress tool announcements |

## Known Limitations

- **No visual diffs** — Claude Code's interactive mode shows inline diffs. Here, you see tool announcements and can review changes with `git diff`.
- **No TUI features** — No file picker, no scrollable output, no syntax highlighting. By design.
- **Buffered output** — Responses are formatted after completion rather than streamed word-by-word, so there's a brief pause before output appears.
- **Permission prompts** — When Claude needs tool permissions, prompts are forwarded via stdin.

## This Is a Prototype

This project is a working proof of concept and a starting point — not a finished product. It demonstrates that the gap between Claude Code and screen reader users is solvable, and that the same approach helps anyone who processes syntax differently.

What would make this better:
- **Testing with real screen reader users** across NVDA, JAWS, VoiceOver, and Orca
- **Feedback on the speech formatting** — are the cues right? Too verbose? Not enough?
- **Windows testing** — especially NVDA + Windows Terminal
- **Streaming speech formatting** — right now we buffer the full response; streaming would feel more responsive
- **Localization** — announcements are English-only currently
- **Upstream integration** — ideally, Claude Code itself would offer an accessible mode

If you use a screen reader, have a cognitive processing difference, or just care about this stuff — your feedback would mean everything. File an issue, open a PR, or just tell me what works and what doesn't.

## Contributing

```bash
git clone https://github.com/JacquelineDMcGraw/claude-accessible.git
cd claude-accessible
npm install
npm run build
npm test          # 149 tests
npm run bench     # Performance benchmarks
```

See [TESTING-WITH-SCREEN-READERS.md](./TESTING-WITH-SCREEN-READERS.md) for the manual screen reader testing protocol.

## Related Issues

- [anthropics/claude-code#11002](https://github.com/anthropics/claude-code/issues/11002) — Screen reader compatibility request
- [anthropics/claude-code#15509](https://github.com/anthropics/claude-code/issues/15509) — Accessibility improvements

## License

MIT — see [LICENSE](./LICENSE)

---

Built by [Jacqueline McGraw](https://github.com/JacquelineDMcGraw) (Team Snowdust).

AI made coding possible for me. This project is about making sure it's possible for everyone.
