# @claude-accessible/core

Shared library for speech formatting, ANSI sanitization, stream parsing, tool announcements, and verbosity filtering. Used by the CLI (`claude-sr`), VS Code extension, and Chrome extension packages.

## Modules

### sanitizer

Strips ANSI escape codes and terminal control sequences from text. Handles CSI, OSC, DCS, APC, 8-bit C1 codes, backspace overwrites, carriage return line rewrites, and orphan escape characters. Provides both a one-shot function and a streaming chunk sanitizer that correctly handles escape sequences split across chunk boundaries.

Exports:

- `sanitize(input: string): string` -- Strip all ANSI codes from a complete string. Also collapses blank lines and trims trailing whitespace.
- `createChunkSanitizer(): ChunkSanitizer` -- Create a streaming sanitizer. Call `.push(chunk)` for each chunk, `.flush()` at end of stream.

### speech-formatter

Parses markdown into an AST using unified/remark-parse/remark-gfm and renders it as screen-reader-friendly plain text. Code fences become `[Python] ... [End Python]`. Headings get `[Heading]` or `[Subheading]` prefixes. Tables are linearized with labeled cells. Bold/italic markers are silently removed. Raw HTML is stripped.

Exports:

- `initFormatter(): Promise<void>` -- Load the remark parser. Must be called once before `formatForSpeech`. Safe to call multiple times.
- `formatForSpeech(text: string): string` -- Transform a markdown string into speech-friendly text.

### stream-parser

Parses Claude Code's NDJSON `stream-json` output format into typed event objects. Handles `system` (init), `assistant` (text, tool_use, tool_result), `stream_event` (text_delta), and `result` message types. Provides a line-buffered streaming interface for processing subprocess output.

Exports:

- `parseStreamLine(line: string): ParsedEvent[]` -- Parse a single NDJSON line into events.
- `createStreamParser(): StreamParser` -- Create a streaming parser. Call `.feed(chunk)` for each chunk, `.flush()` at end of stream.

### announcer

Converts tool_use events into human-readable status lines for stderr. Recognizes Claude Code tools by name (Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch, WebSearch, and others) and formats each with a descriptive message. Also formats result and error events.

Exports:

- `announceToolUse(event: ParsedToolUseEvent): string` -- Format a tool use as a status line like `[Tool] Reading file: src/index.ts`.
- `announceResult(event: ParsedResultEvent): string` -- Format a completion summary like `[Done] Response complete. (3 turns, $0.0412 cost)`.
- `announceError(event: ParsedResultEvent): string` -- Format an error like `[Error] Claude returned an error.`.
- `writeAnnouncement(text: string): void` -- Write text to stderr with a newline.

### verbosity

Wraps `formatForSpeech()` with configurable detail levels.

Exports:

- `createVerbosityFilter(level: VerbosityLevel): VerbosityFilter` -- Create a filter. Call `.format(text)` to get speech text at the configured verbosity.

Levels:

- `"minimal"` -- Keeps code block markers and headings. Strips table annotations, quote markers, bullet prefixes, and link URLs.
- `"normal"` -- Default. Returns the full output of `formatForSpeech()`.
- `"detailed"` -- Enriches code block markers with line counts (`[Python, 15 lines]`) and table headers with row counts.

## Usage example

    import {
      initFormatter,
      formatForSpeech,
      sanitize,
      createStreamParser,
      createVerbosityFilter,
    } from "@claude-accessible/core";

    // Initialize once at startup
    await initFormatter();

    // Sanitize raw CLI output
    const clean = sanitize(rawAnsiText);

    // Format markdown for speech
    const speech = formatForSpeech(clean);

    // Or use a verbosity filter
    const filter = createVerbosityFilter("detailed");
    const detailed = filter.format(clean);

    // Parse streaming NDJSON from Claude subprocess
    const parser = createStreamParser();
    subprocess.stdout.on("data", (chunk) => {
      const events = parser.feed(chunk);
      for (const event of events) {
        // event.type is "init" | "text" | "text_delta" | "tool_use" | "tool_result" | "result"
      }
    });

## Dependencies

- unified (AST pipeline)
- remark-parse (markdown parser)
- remark-gfm (GitHub Flavored Markdown: tables, strikethrough, autolinks)

## License

MIT
