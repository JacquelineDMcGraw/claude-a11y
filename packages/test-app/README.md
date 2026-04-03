# claude-a11y Test App

Electron app for local accessibility testing. Provides an embedded terminal, screen and audio recording, Whisper transcription with latency analysis, and an autonomous Claude computer-use agent.

## Requirements

- macOS (screen recording and TTS depend on macOS APIs)
- Node.js 20 or later
- For recording analysis: a local Whisper installation (the app auto-detects common install paths)
- For the Agent tab: an Anthropic API key
- cliclick (install with `brew install cliclick`) if using the Agent tab

## Setup

From the repo root:

```
npm install
npm run test-app
```

The first launch may prompt for macOS Screen Recording permission. Grant it in System Settings, then quit and relaunch the app.

If you see errors about native modules, rebuild them:

```
cd packages/test-app
npx electron-rebuild -f -w node-pty
```

## Usage

The app has two tabs.

### Manual tab

A live terminal where you can run the test sandbox or any command. Use the header buttons to:

- Run Sandbox: launches test-sandbox.sh in the embedded terminal
- Record: captures screen and system audio as a WebM file
- Analyze: runs Whisper on the last recording and shows a latency report

The sidebar shows a parsed test log with PASS, FAIL, SKIP, and HEAR entries extracted from the terminal output.

### Agent tab (Claude Computer Use)

Lets Claude autonomously control your Mac to test, develop, or audit the project. Three modes:

- Autonomous Test Runner: runs the full sandbox, answers prompts, runs unit tests, summarizes results
- Development Agent: builds, finds failures, fixes code, rebuilds, repeats
- Accessibility Auditor: evaluates TTS quality, earcon timing, and produces a scored report

Enter your Anthropic API key, pick a model and mode, and click Start Agent. Claude takes screenshots, clicks, types, and runs commands on your desktop. Click Stop at any time.

Note: the Agent tab calls the Anthropic API directly and incurs token costs. Sonnet is cheaper and faster; Opus is more capable for complex debugging.

## Recordings

All recordings are saved to the recordings directory at the repo root. This directory is gitignored so nothing is committed or published. You can delete its contents at any time.

## Keyboard shortcuts

- Cmd+R: toggle recording
- Cmd+Shift+A: analyze last recording

## Accessibility

The app uses xterm.js with screenReaderMode enabled, ARIA landmarks on all panels and logs, and aria-live regions for status updates. Color contrast meets WCAG AA (4.5:1 minimum).
