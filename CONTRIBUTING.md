# Contributing to claude-a11y

## Setup

```
git clone https://github.com/JacquelineDMcGraw/claude-a11y.git
cd claude-a11y
npm install
npm run build
npm test
```

Requires Node.js 20 or later.

## Project structure

This is a monorepo with three packages:

- packages/browser -- Chrome extension, shared phrasing config, and DOM injection script. No build step. Load as unpacked in Chrome. Has 81 tests (DOM transforms, axe-core WCAG, ARIA snapshots, content script, background, popup).
- packages/node -- Node.js library, CLI wrapper (claude-sr), VS Code extension, and Claude Code hooks integration (claude-a11y-hooks). Contains the speech formatter, sanitizer, tool formatters, significance classifier, earcon system, TTS support, and all Node-based tooling. Has 777 tests.
- packages/test-app -- Electron app for local accessibility testing. Embeds a terminal, records screen and audio, runs Whisper transcription, and includes a Claude computer-use agent for autonomous testing. See packages/test-app/README.md for setup.

Build the node package (which includes the core library, CLI, and VS Code extension):

```
npm run build -w packages/node
npm run compile -w packages/node
```

Or build everything at once:

```
npm run build:all
```

## Running tests

```
npm test
```

This runs all test suites across both packages: browser (81 tests) and node (777 tests, covering core, CLI, VS Code extension, and Claude Code hooks). 858 tests total.

## Accessibility test sandbox

To run the interactive accessibility testing sandbox (macOS):

```
./test-sandbox.sh
```

This runs each hook fixture through the formatter, plays TTS and earcons, and produces a visual log. Choose option 5 (All) to run the full suite. See packages/test-app/README.md for the Electron-based test app with recording and Whisper analysis.

## Screen reader testing

If you have access to a screen reader, manual testing is the most valuable contribution you can make. The automated tests verify output correctness, but only a real screen reader can confirm that the announcements are useful, properly timed, and not overwhelming.

When testing, please note:

- Which screen reader you used and its version (NVDA 2024.4, VoiceOver on macOS 15, JAWS 2024, Orca 46, etc.)
- Which package you tested (Chrome extension, VS Code extension, CLI)
- What worked and what did not
- Whether announcement phrasing was clear or confusing
- Whether navigation between code blocks, headings, and messages worked as expected

File an issue with your findings or include them in a pull request description.

## Writing accessible code

This project exists for screen reader users. All contributions must follow these rules:

- No emoji in code, comments, documentation, or commit messages.
- No ASCII art or decorative characters.
- No markdown tables in documentation. Use lists or plain text instead.
- Link text must be descriptive. Write "see the contributing guide" not "click here."
- ARIA attributes must be valid. Do not invent roles or use aria-label on elements that do not support it.
- Screen-reader-only spans use the `ca11y-sr-only` CSS class. Do not use `display: none` or `visibility: hidden` for content that should be read by assistive technology.
- All HTML must include `lang` attributes where appropriate.
- Focus styles must be visible and high contrast.

## Pull request expectations

Before submitting a PR:

1. Run `npm test` and confirm all tests pass.
2. Run `npm run build` and confirm it compiles without errors.
3. If you changed the Chrome extension, load it as unpacked in Chrome and verify it works on a supported site (claude.ai, chatgpt.com, gemini.google.com, copilot.microsoft.com).
4. If you changed the VS Code extension, test it in the Extension Development Host (F5).
5. If you changed the CLI, run `claude-sr "hello"` and verify the output is clean.
6. Describe what you changed, why, and how you tested it.
7. If your change affects screen reader output, describe what a screen reader announces before and after your change.

## Filing issues

Bug reports should include:

- What you expected to happen.
- What actually happened.
- Your operating system and version.
- Your screen reader name and version (if applicable).
- Your browser name and version (if applicable, for Chrome extension issues).
- Steps to reproduce.

Feature requests should describe the problem you are trying to solve, not just the feature you want. This helps us find the right solution.

## Screen reader validation

The `test-voiceover.sh` script validates accessibility output in two phases:

Phase 1 -- Hooks TTS validation: feeds hook fixtures through the format pipeline, records system audio, transcribes with local Whisper, and asserts expected phrases appear in the transcript.

Phase 2 -- Browser extension validation: loads `sr-validation.html` in jsdom, injects `chat-a11y.js`, uses a virtual screen reader to navigate through all 9 test sections, and asserts that the expected ARIA announcements are present. This runs entirely in-process (no real browser, no VoiceOver, no focus stealing).

Requirements for Phase 1: macOS, ffmpeg, local Whisper install. The script auto-detects available audio capture methods.
Requirements for Phase 2: Node.js 20 or later. The virtual screen reader is installed as a dev dependency.

Running the suite:

1. Run `./test-voiceover.sh` for the full suite (hooks and browser), or `./test-voiceover.sh quick` for the tiny Whisper model.
2. Run `./test-voiceover.sh --skip-browser` for hooks-only validation.
3. Run `./test-voiceover.sh --skip-hooks` for browser-only validation (fast, no audio capture needed).
4. Results are written to `recordings/results/` as JSON and Markdown. These files are committed as evidence for accessibility validation.
5. Raw audio files are gitignored and never committed.

If you add a new hook formatter, add a fixture in `packages/node/tests/hooks/fixtures/hook-inputs/` and an assertion entry in the hooks section of `test-voiceover.sh`. If you add a new DOM transform to `chat-a11y.js`, add a test section to `packages/browser/tests/sr-validation.html` and update the assertions in `test-browser-voiceover.js`.

## Code style

- TypeScript for core and CLI. Plain JavaScript (ES5-compatible) for the Chrome extension and chat-a11y.js.
- ESLint is configured for the browser package. Run it with `npm run lint -w packages/browser`.
- Prefer explicit over clever. This codebase is meant to be readable.

## License

By contributing, you agree that your contributions will be licensed under the MIT license that covers this project.
