# claude-sr -- Screen Reader CLI for Claude Code

Command-line wrapper around Claude Code that outputs screen-reader-friendly text. Strips ANSI escape codes, eliminates spinners and line rewriting, parses markdown into a speech-friendly AST representation, and announces tool activity as plain text.

Compatible with NVDA, JAWS, VoiceOver, and Orca.

## Requirements

- Node.js 18 or later.
- Claude Code CLI installed and authenticated. Install from the Anthropic docs at https://docs.anthropic.com/en/docs/claude-code/overview, then run `claude login`.

## Installation

From the repository root:

    npm install
    cd packages/cli
    npm run build
    npm link

This makes `claude-sr` and `claude-accessible` available as global commands.

## Usage

### REPL mode (interactive)

    claude-sr

Starts a conversational session. Type a message and press Enter. All output is linear, append-only, and free of escape codes. The prompt character defaults to `> ` and can be changed with the `CLAUDE_SR_PROMPT` environment variable.

REPL commands:

- `/help` -- Show help.
- `/new` -- Start a new session.
- `/session` -- Show the current session ID.
- `/cost` -- Show accumulated cost.
- `/version` -- Show claude-sr and Claude Code versions.
- `/compact` -- Compact conversation context.
- `/clear` -- Clear the screen.
- `/exit` -- Exit (also `/quit` or Ctrl+D).

### One-shot mode

    claude-sr "explain this project"

Sends a single prompt to Claude and prints the formatted response to stdout. Equivalent to `claude -p` but with all output sanitized.

    echo "fix lint errors" | claude-sr

Piped input also triggers one-shot mode.

### Session management

    claude-sr -c "now add tests"

Continue the most recent conversation.

    claude-sr -r <session-id> "what about error handling"

Resume a specific session by ID.

## How it works

1. claude-sr spawns the `claude` CLI as a child process with `NO_COLOR=1`, `FORCE_COLOR=0`, and `TERM=dumb` to suppress ANSI at the source.
2. In one-shot mode, stdout is collected, run through the ANSI sanitizer (`@claude-accessible/core` sanitize), then passed through the remark-based speech formatter which parses the markdown AST and renders structural cues.
3. In REPL mode, stdout uses `--output-format stream-json --verbose`. The stream parser processes NDJSON lines into typed events. Text events are sanitized and buffered, then speech-formatted on completion. Tool events are announced on stderr.
4. Prompts and status messages go to stderr. Claude's formatted response text goes to stdout. This separation means piping stdout captures only the response.

## Example

Input (what you type):

    claude-sr "show me a python hello world"

Output (what your screen reader hears):

    Here is a simple Python hello world program:

    [Python]
    print("Hello, world!")
    [End Python]

    This prints the text Hello, world! to the console.

A markdown table like `| Name | Age |` becomes:

    [Table, 2 columns]
    [Header] Name | Age
    [Row 1] Name: Alice, Age: 30
    [End Table]

## Flags

All Claude Code CLI flags are passed through. Key flags:

- `-m, --model <model>` -- Set model (sonnet, opus, haiku, or full name).
- `-c, --continue` -- Continue most recent conversation.
- `-r, --resume <id>` -- Resume a specific session.
- `--max-turns <n>` -- Limit agentic turns.
- `--verbose` -- Enable verbose output.
- `--permission-mode <mode>` -- Set permission mode.
- `--mcp-config <path>` -- Load MCP servers from JSON.

Run `claude-sr --help` for the full list.

## Environment variables

- `CLAUDE_SR_PROMPT` -- Custom prompt character (default: `> `).
- `CLAUDE_SR_ANNOUNCE` -- Set to `0` to suppress tool use announcements.
- `CLAUDE_PATH` -- Path to the Claude CLI binary if not on PATH.

## License

MIT
