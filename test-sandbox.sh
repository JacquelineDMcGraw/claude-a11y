#!/usr/bin/env bash
# test-sandbox.sh — Isolated accessibility testing sandbox for claude-a11y
#
# Designed for two audiences simultaneously:
#   - A blind tester using a screen reader hears TTS, earcons, and spoken cues
#   - A sighted tester watching the terminal sees a visual log of what played,
#     what was expected, and what (if anything) was silently dropped
#
# Everything runs in a temp directory. Nothing touches your daily config.
# On exit, everything is cleaned up automatically.
#
# Usage:
#   ./test-sandbox.sh            # Interactive menu
#   ./test-sandbox.sh hooks      # Jump straight to hooks demo
#   ./test-sandbox.sh cli        # Jump straight to CLI demo
#   ./test-sandbox.sh vscode     # Jump straight to VS Code info
#   ./test-sandbox.sh chrome     # Jump straight to Chrome demo

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SANDBOX_DIR=""
SETTINGS_BACKED_UP=false
ORIGINAL_SETTINGS=""
CHROME_PID=""
RECORDING_ACTIVE=false

# ── Cleanup (runs on EXIT) ────────────────────────────────────────

cleanup() {
  echo ""
  echo "Cleaning up sandbox..."

  if [ "$RECORDING_ACTIVE" = true ]; then
    echo "  Stopping recording and running analysis..."
    "$REPO_DIR/test-record.sh" stop || true
    RECORDING_ACTIVE=false
  fi

  if [ -n "$CHROME_PID" ] && kill -0 "$CHROME_PID" 2>/dev/null; then
    echo "  Closing sandboxed Chrome..."
    kill "$CHROME_PID" 2>/dev/null || true
  fi

  if [ "$SETTINGS_BACKED_UP" = true ] && [ -n "$ORIGINAL_SETTINGS" ]; then
    echo "  Restoring ~/.claude/settings.json from backup..."
    if [ -f "$ORIGINAL_SETTINGS" ]; then
      cp "$ORIGINAL_SETTINGS" "$HOME/.claude/settings.json"
    else
      rm -f "$HOME/.claude/settings.json"
    fi
  fi

  if [ -n "$SANDBOX_DIR" ] && [ -d "$SANDBOX_DIR" ]; then
    echo "  Removing temp directory: $SANDBOX_DIR"
    rm -rf "$SANDBOX_DIR"
  fi

  echo ""
  echo "Sandbox cleaned up."
  echo "Reminder: If VoiceOver is still on, press Cmd+F5 to toggle it off."
  echo ""
}

trap cleanup EXIT

# ── Setup sandbox ──────────────────────────────────────────────────

SANDBOX_DIR="$(mktemp -d /tmp/claude-a11y-sandbox-XXXXXX)"
SANDBOX_CONFIG="$SANDBOX_DIR/config"
SANDBOX_STATE="$SANDBOX_DIR/state"
SANDBOX_CHROME="$SANDBOX_DIR/chrome-profile"
TEST_LOG="$SANDBOX_DIR/test-log.txt"

mkdir -p "$SANDBOX_CONFIG" "$SANDBOX_STATE" "$SANDBOX_CHROME"

export CLAUDE_A11Y_HOOKS_CONFIG_DIR="$SANDBOX_CONFIG"
export XDG_STATE_HOME="$SANDBOX_STATE"

echo "claude-a11y Testing Sandbox"
echo "==========================="
echo ""
echo "Sandbox directory: $SANDBOX_DIR"
echo ""
echo "Your real config files are NOT touched."
echo ""

# ── Recording prompt ───────────────────────────────────────────────

read -r -p "Would you like to record this session for analysis? (y/n): " record_choice
if [ "$record_choice" = "y" ] || [ "$record_choice" = "Y" ]; then
  if [ ! -f "$REPO_DIR/recordings/.config" ]; then
    echo ""
    echo "First time recording. Running setup..."
    echo ""
    "$REPO_DIR/test-record.sh" setup
  fi
  echo ""
  "$REPO_DIR/test-record.sh" start
  RECORDING_ACTIVE=true
  echo ""
fi

# ── Build check ────────────────────────────────────────────────────

ensure_built() {
  if [ ! -f "$REPO_DIR/packages/node/dist/hooks/cli/index.js" ] || \
     [ ! -f "$REPO_DIR/packages/node/dist/cli/index.js" ]; then
    echo "Build artifacts not found. Building now..."
    (cd "$REPO_DIR" && npm run build)
    echo ""
    echo "Build complete."
    echo ""
  fi
}

# ── Paths ──────────────────────────────────────────────────────────

HOOKS_BIN="$REPO_DIR/packages/node/bin/claude-a11y-hooks.js"
CLI_BIN="$REPO_DIR/packages/node/bin/claude-sr.js"
FIXTURES_DIR="$REPO_DIR/packages/node/tests/hooks/fixtures/hook-inputs"

# ── Dual-audience logging ──────────────────────────────────────────
# Every test step logs to both the terminal (for sighted testers) and
# speaks a short cue (for blind testers). The visual log also captures
# what was EXPECTED to happen vs what DID happen, so a sighted reviewer
# can spot silent failures.

log_test() {
  local status="$1"
  local message="$2"
  local timestamp
  timestamp="$(date +%H:%M:%S)"

  local prefix=""
  case "$status" in
    PASS) prefix="[PASS]" ;;
    FAIL) prefix="[FAIL]" ;;
    SKIP) prefix="[SKIP]" ;;
    INFO) prefix="[INFO]" ;;
    HEAR) prefix="[HEAR]" ;;
  esac

  echo "$timestamp $prefix $message"
  echo "$timestamp $prefix $message" >> "$TEST_LOG"
}

speak_and_wait() {
  local text="$1"
  local rate="${2:-200}"
  say -r "$rate" -- "$text" 2>/dev/null
}

# ── Audio health check ────────────────────────────────────────────
# Before any demo, verify that TTS and earcons actually produce sound.
# This catches broken audio routing before wasting the tester's time.

audio_health_check() {
  echo ""
  echo "AUDIO HEALTH CHECK"
  echo "=================="
  echo ""
  echo "Testing that your Mac can produce sound."
  echo "You should hear two things: a spoken phrase, then a system sound."
  echo ""

  log_test INFO "Starting audio health check"

  echo "  Playing TTS test..."
  say -r 200 -- "Audio check. If you hear this, text to speech is working." 2>/dev/null
  local tts_exit=$?

  if [ $tts_exit -eq 0 ]; then
    log_test PASS "TTS (say command) executed successfully"
  else
    log_test FAIL "TTS (say command) failed with exit code $tts_exit"
    echo ""
    echo "  Warning: The say command failed. TTS announcements will not work."
    echo "  Check that your Mac volume is not muted."
  fi

  sleep 1

  echo "  Playing earcon test..."
  afplay -v 0.5 /System/Library/Sounds/Glass.aiff 2>/dev/null
  local earcon_exit=$?

  if [ $earcon_exit -eq 0 ]; then
    log_test PASS "Earcon (afplay) executed successfully"
  else
    log_test FAIL "Earcon (afplay) failed with exit code $earcon_exit"
    echo ""
    echo "  Warning: afplay failed. Earcon sounds will not work."
  fi

  echo ""

  if [ $tts_exit -ne 0 ] && [ $earcon_exit -ne 0 ]; then
    echo "  Neither TTS nor earcons are working."
    echo "  The demos will still run but you will not hear anything."
    read -r -p "  Continue anyway? (y/n): " continue_choice
    if [ "$continue_choice" != "y" ] && [ "$continue_choice" != "Y" ]; then
      echo "Exiting."
      exit 0
    fi
  else
    speak_and_wait "Audio check passed. Starting demos."
    log_test PASS "Audio health check complete"
  fi

  echo ""
}

# ── Section 1: Hooks demo ─────────────────────────────────────────
# Each fixture is announced, played, and verified individually.
# The visual log shows what TTS text and earcon were expected.
# A sighted tester can compare expected vs actual; a blind tester
# hears each announcement and the earcon that follows it.

demo_hooks() {
  ensure_built
  echo ""
  echo "HOOKS DEMO"
  echo "=========="
  echo ""
  speak_and_wait "Hooks demo. You will hear a spoken summary and an audio cue for each tool type."

  cat > "$SANDBOX_CONFIG/config.json" <<'CONF'
{
  "verbosity": "normal",
  "tts": { "enabled": true, "engine": "auto", "rate": 200, "maxLength": 500 },
  "earcon": { "enabled": true, "engine": "auto", "volume": 0.5 },
  "significance": { "enabled": true, "overrides": {} },
  "silence": { "enabled": false, "tools": {} },
  "history": { "enabled": true, "maxEntries": 500 },
  "progress": { "enabled": true, "thresholdMs": 3000 },
  "digest": { "enabled": false },
  "permissions": { "rules": [] },
  "summarize": { "enabled": true, "maxDeclarations": 10, "maxTtsNames": 3 }
}
CONF

  log_test INFO "Sandbox config written (TTS on, earcons on, verbosity normal)"

  # Fixture list: file name, human description, expected context/TTS substring
  # bash-success (ls exit 0) is noise -- only contextText survives: "Ran: ls"
  # bash-failure (cat exit 1) is now notable -- gets TTS: "Ran: cat"
  # read is noise, glob is noise, grep is noise -- only contextText
  local fixtures=(
    "bash-success|Bash command succeeds|Ran:"
    "bash-failure|Bash command fails|Ran:"
    "edit|File edit|Edited"
    "read|File read|Read"
    "write|File write|Wrote"
    "glob|Glob search|Glob"
    "grep|Grep search|Grep"
    "task|Task operation|Task"
    "web-search|Web search|search"
    "web-fetch|Web fetch|Fetched"
  )

  local total=${#fixtures[@]}
  local passed=0
  local failed=0
  local skipped=0

  echo ""
  echo "Playing $total tool types. Each one:"
  echo "  1. Announces what is about to play"
  echo "  2. Pipes the fixture through the hooks formatter"
  echo "  3. Shows what TTS text and earcon were produced"
  echo "  4. Waits for the audio to finish before moving on"
  echo ""

  for i in "${!fixtures[@]}"; do
    local entry="${fixtures[$i]}"
    local file desc expected_substr
    IFS='|' read -r file desc expected_substr <<< "$entry"
    local num=$((i + 1))
    local fixture_path="$FIXTURES_DIR/${file}.json"

    if [ ! -f "$fixture_path" ]; then
      log_test SKIP "$num of $total: $desc (fixture $file.json not found)"
      skipped=$((skipped + 1))
      continue
    fi

    speak_and_wait "$num of $total. $desc."

    # Run the fixture through the pipeline and capture what it produced
    local output
    output="$(cat "$fixture_path" | node "$HOOKS_BIN" format 2>/dev/null)" || true

    # The format command fires TTS and earcon as side effects.
    # Wait for the say process to finish (it runs in background).
    sleep 4

    # Parse what the pipeline returned to show to the sighted tester
    local additional_context=""
    if [ -n "$output" ]; then
      additional_context="$(echo "$output" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    ctx = d.get('hookSpecificOutput', {}).get('additionalContext', '')
    print(ctx)
except:
    print('')
" 2>/dev/null)" || true
    fi

    if [ -n "$additional_context" ]; then
      log_test HEAR "$num of $total: $desc"
      log_test INFO "  Pipeline returned: $additional_context"
      # Check if the expected substring appears in the output
      if echo "$additional_context" | grep -qi "$expected_substr"; then
        log_test PASS "  Contains expected text: '$expected_substr'"
        passed=$((passed + 1))
      else
        log_test FAIL "  Missing expected text: '$expected_substr'"
        log_test INFO "  Full output was: $additional_context"
        failed=$((failed + 1))
      fi
    else
      log_test FAIL "$num of $total: $desc — pipeline returned empty output"
      failed=$((failed + 1))
    fi

    echo ""
  done

  echo ""
  echo "Hooks demo results: $passed passed, $failed failed, $skipped skipped out of $total"
  log_test INFO "Hooks demo results: $passed passed, $failed failed, $skipped skipped out of $total"
  speak_and_wait "Hooks demo complete. $passed of $total passed."

  echo ""
  echo "OPTIONAL: Install hooks into Claude Code for live testing?"
  echo "This will modify ~/.claude/settings.json (backed up and restored on exit)."
  read -r -p "Install hooks? (y/n): " install_choice
  if [ "$install_choice" = "y" ] || [ "$install_choice" = "Y" ]; then
    if [ -f "$HOME/.claude/settings.json" ]; then
      ORIGINAL_SETTINGS="$SANDBOX_DIR/settings-backup.json"
      cp "$HOME/.claude/settings.json" "$ORIGINAL_SETTINGS"
    else
      ORIGINAL_SETTINGS=""
    fi
    SETTINGS_BACKED_UP=true

    node "$HOOKS_BIN" setup
    log_test INFO "Hooks installed into Claude Code (will be restored on exit)"
    speak_and_wait "Hooks installed. Use Claude Code normally to hear announcements. Settings will be restored when you exit this sandbox."
  fi

  echo ""
  read -r -p "Press Enter to continue... "
  echo ""
}

# ── Section 2: CLI demo ───────────────────────────────────────────
# Pre-checks auth before attempting. Explains failures audibly.

demo_cli() {
  ensure_built
  echo ""
  echo "CLI DEMO"
  echo "========"
  echo ""
  speak_and_wait "CLI demo. Testing the claude-sr screen reader wrapper."

  if ! command -v claude &>/dev/null; then
    log_test SKIP "CLI demo: 'claude' command not found"
    speak_and_wait "The claude command is not installed. Skipping CLI demo. Install Claude Code from docs.anthropic.com to test this."
    echo ""
    echo "  The 'claude' command was not found."
    echo "  Install Claude Code: https://docs.anthropic.com/en/docs/claude-code"
    echo ""
    read -r -p "Press Enter to continue... "
    echo ""
    return
  fi

  # Auth pre-check: run a no-op to see if credentials work
  echo "  Checking Claude Code authentication..."
  local auth_check
  auth_check="$(claude --version 2>&1)" || true

  # Try a quick model ping to check auth
  local auth_test
  auth_test="$(echo '{"prompt":"test","max_tokens":1}' | timeout 10 claude --print 2>&1)" || true

  if echo "$auth_test" | grep -qi "authentication_error\|expired\|unauthorized\|401"; then
    log_test FAIL "CLI demo: Claude Code authentication failed"
    speak_and_wait "Claude Code authentication has expired. You need to refresh your token before the CLI demo will work. Run 'claude' by itself to re-authenticate, then try this demo again."
    echo ""
    echo "  Authentication failed. Your OAuth token may be expired."
    echo "  Run 'claude' to re-authenticate, then try this demo again."
    echo "  Error: $auth_test"
    echo ""
    read -r -p "Press Enter to continue... "
    echo ""
    return
  fi

  log_test INFO "Authentication looks OK"

  echo ""
  echo "  The CLI formats Claude's output for screen readers:"
  echo "    - Strips ANSI codes and spinner artifacts"
  echo "    - Announces code blocks: 'Python code block' instead of backtick noise"
  echo "    - Adds structural cues: 'End Python' after code blocks"
  echo ""

  speak_and_wait "Running a sample prompt through claude-sr."

  echo "  Running: claude-sr 'Write a hello world in Python and explain it briefly.'"
  echo ""
  local cli_output
  cli_output="$(node "$CLI_BIN" "Write a hello world function in Python and explain it briefly." 2>&1)" || true

  if [ -n "$cli_output" ]; then
    echo "$cli_output"
    log_test PASS "CLI produced output (${#cli_output} characters)"
  else
    log_test FAIL "CLI produced no output"
  fi

  echo ""
  speak_and_wait "CLI demo complete."
  log_test INFO "CLI demo finished"

  echo ""
  read -r -p "Press Enter to continue... "
  echo ""
}

# ── Section 3: VS Code extension ──────────────────────────────────

demo_vscode() {
  ensure_built
  echo ""
  echo "VS CODE EXTENSION"
  echo "=================="
  echo ""
  speak_and_wait "VS Code extension. This section builds the extension and explains how to test it."

  log_test INFO "VS Code extension section"

  echo "  The VS Code extension provides:"
  echo "    - An @accessible chat participant for the chat panel"
  echo "    - Screen-reader-friendly output formatting"
  echo "    - Configurable verbosity levels"
  echo "    - Keyboard shortcuts for navigation"
  echo ""
  echo "  Testing options:"
  echo "    Option A: Press F5 in this repo to launch the Extension Development Host"
  echo "    Option B: Build and install the .vsix package"
  echo ""

  read -r -p "Build the .vsix package now? (y/n): " build_choice
  if [ "$build_choice" = "y" ] || [ "$build_choice" = "Y" ]; then
    echo ""
    speak_and_wait "Building the VS Code extension. This may take a moment."
    echo "  Building..."
    local build_output
    build_output="$(cd "$REPO_DIR/packages/node" && npm run compile 2>&1 && npx @vscode/vsce package --no-dependencies 2>&1)" || true

    local vsix_file
    vsix_file="$(find "$REPO_DIR/packages/node" -maxdepth 1 -name "*.vsix" -type f 2>/dev/null | head -1)"
    if [ -n "$vsix_file" ]; then
      log_test PASS "VS Code extension built: $vsix_file"
      speak_and_wait "Extension built successfully."
      echo ""
      echo "  Built: $vsix_file"
      echo "  Install with: code --install-extension $vsix_file"
    else
      log_test FAIL "VS Code extension build did not produce a .vsix file"
      speak_and_wait "Extension build failed. Check the build output for errors."
      echo "  Build output:"
      echo "$build_output" | tail -20
    fi
  else
    log_test SKIP "VS Code extension build skipped by user"
  fi

  echo ""
  read -r -p "Press Enter to continue... "
  echo ""
}

# ── Section 4: Chrome extension ───────────────────────────────────
# Suppresses Chrome stderr noise. Announces steps audibly.

demo_chrome() {
  echo ""
  echo "CHROME EXTENSION"
  echo "================="
  echo ""
  speak_and_wait "Chrome extension demo. This tests the browser accessibility features."

  local chrome_path=""
  if [ -d "/Applications/Google Chrome.app" ]; then
    chrome_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  elif [ -d "/Applications/Chromium.app" ]; then
    chrome_path="/Applications/Chromium.app/Contents/MacOS/Chromium"
  elif [ -d "/Applications/Brave Browser.app" ]; then
    chrome_path="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
  fi

  if [ -z "$chrome_path" ]; then
    log_test SKIP "Chrome demo: no Chromium-based browser found"
    speak_and_wait "No Chrome browser found. Skipping this demo."
    echo "  Install Chrome, Chromium, or Brave to test the extension."
    echo ""
    read -r -p "Press Enter to continue... "
    echo ""
    return
  fi

  log_test INFO "Browser found: $chrome_path"

  echo "  What the extension does:"
  echo "    - Adds ARIA landmarks to chat messages"
  echo "    - Labels code blocks with language names"
  echo "    - Adds keyboard navigation: Alt+Up/Down between messages"
  echo "    - Announces response completion"
  echo ""
  echo "  Testing steps once Chrome opens:"
  echo "    1. Log in to claude.ai"
  echo "    2. Send a message"
  echo "    3. Turn on VoiceOver (Cmd+F5) to hear the accessible output"
  echo "    4. Try Alt+Up and Alt+Down to navigate messages"
  echo "    5. Use the VoiceOver rotor (VO+U) for landmarks"
  echo ""

  read -r -p "Launch sandboxed Chrome now? (y/n): " launch_choice
  if [ "$launch_choice" = "y" ] || [ "$launch_choice" = "Y" ]; then
    local ext_path="$REPO_DIR/packages/browser"
    speak_and_wait "Launching Chrome with a temporary profile. Your real browser data is not affected."
    echo "  Launching..."

    "$chrome_path" \
      --user-data-dir="$SANDBOX_CHROME" \
      --load-extension="$ext_path" \
      --no-first-run \
      --no-default-browser-check \
      "https://claude.ai" \
      >/dev/null 2>&1 &
    CHROME_PID=$!

    log_test INFO "Chrome launched (PID: $CHROME_PID)"
    echo "  Chrome launched. The extension is loaded."
    echo ""

    speak_and_wait "Chrome is open. Navigate to claude.ai and test with VoiceOver. Press Enter in the terminal when you are done."

    read -r -p "Press Enter when done testing Chrome... "

    if kill -0 "$CHROME_PID" 2>/dev/null; then
      kill "$CHROME_PID" 2>/dev/null || true
    fi
    CHROME_PID=""

    log_test INFO "Chrome closed"
    speak_and_wait "Chrome closed."
  else
    log_test SKIP "Chrome launch skipped by user"
  fi

  echo ""
}

# ── Test summary ───────────────────────────────────────────────────

show_summary() {
  echo ""
  echo "SESSION SUMMARY"
  echo "==============="
  echo ""

  if [ -f "$TEST_LOG" ]; then
    local pass_count fail_count skip_count
    pass_count="$(grep -c '\[PASS\]' "$TEST_LOG" 2>/dev/null || echo 0)"
    fail_count="$(grep -c '\[FAIL\]' "$TEST_LOG" 2>/dev/null || echo 0)"
    skip_count="$(grep -c '\[SKIP\]' "$TEST_LOG" 2>/dev/null || echo 0)"

    echo "Results: $pass_count passed, $fail_count failed, $skip_count skipped"
    echo ""

    if [ "$fail_count" -gt 0 ]; then
      echo "Failures:"
      grep '\[FAIL\]' "$TEST_LOG" | while IFS= read -r line; do
        echo "  $line"
      done
      echo ""
    fi

    if [ "$skip_count" -gt 0 ]; then
      echo "Skipped:"
      grep '\[SKIP\]' "$TEST_LOG" | while IFS= read -r line; do
        echo "  $line"
      done
      echo ""
    fi

    echo "Full log: $TEST_LOG"

    speak_and_wait "Session complete. $pass_count passed. $fail_count failed. $skip_count skipped."
  else
    echo "No tests were run."
    speak_and_wait "Session complete. No tests were run."
  fi

  echo ""
}

# ── Main menu ─────────────────────────────────────────────────────

show_menu() {
  echo "What would you like to test?"
  echo ""
  echo "  1) Hooks   - Hear TTS and earcon sounds for each tool type"
  echo "  2) CLI     - Run claude-sr screen reader wrapper"
  echo "  3) VS Code - Build and test the VS Code extension"
  echo "  4) Chrome  - Test the Chrome extension with VoiceOver"
  echo "  5) All     - Run all demos in sequence"
  echo "  q) Quit    - Show summary and exit"
  echo ""
}

run_all() {
  audio_health_check
  demo_hooks
  demo_cli
  demo_vscode
  demo_chrome
  show_summary
}

# ── Entry point ───────────────────────────────────────────────────

if [ $# -gt 0 ]; then
  case "$1" in
    hooks)
      audio_health_check
      demo_hooks
      show_summary
      ;;
    cli)
      audio_health_check
      demo_cli
      show_summary
      ;;
    vscode)
      demo_vscode
      show_summary
      ;;
    chrome)
      demo_chrome
      show_summary
      ;;
    all) run_all ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [hooks|cli|vscode|chrome|all]"
      exit 1
      ;;
  esac
  exit 0
fi

while true; do
  show_menu
  read -r -p "Choose (1-5, q): " choice
  case "$choice" in
    1)
      audio_health_check
      demo_hooks
      ;;
    2)
      audio_health_check
      demo_cli
      ;;
    3) demo_vscode ;;
    4) demo_chrome ;;
    5) run_all ;;
    q|Q)
      show_summary
      break
      ;;
    *)
      echo "Invalid choice. Enter 1-5 or q."
      echo ""
      ;;
  esac
done
