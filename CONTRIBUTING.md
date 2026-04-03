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

The `test-voiceover.sh` script validates that TTS and earcon output from the hooks system is correct by recording system audio, transcribing with local Whisper, and asserting expected phrases appear in the transcript.

Requirements: macOS, ffmpeg, local Whisper install. The script auto-detects available audio capture methods.

1. Run `./test-voiceover.sh` for full validation, or `./test-voiceover.sh quick` to use the tiny Whisper model for faster but less accurate results.
2. The script feeds each hook fixture through the format pipeline, records the TTS output, and checks the transcription.
3. Results are written to `recordings/results/` as JSON and Markdown. These files are committed to the repo as evidence for accessibility validation.
4. Raw audio files (wav, mp4) are gitignored and never committed.

If you add a new hook formatter, add a corresponding fixture in `packages/node/tests/hooks/fixtures/hook-inputs/` and add an assertion entry in `test-voiceover.sh`.

## Code style

- TypeScript for core and CLI. Plain JavaScript (ES5-compatible) for the Chrome extension and chat-a11y.js.
- ESLint is configured for the browser package. Run it with `npm run lint -w packages/browser`.
- Prefer explicit over clever. This codebase is meant to be readable.

## License

By contributing, you agree that your contributions will be licensed under the MIT license that covers this project.
