#!/usr/bin/env bash
# test-with-speech.sh — Quick way to hear what claude-sr sounds like
#
# Usage:
#   ./bin/test-with-speech.sh                      # Uses default test prompt
#   ./bin/test-with-speech.sh "your question"      # Custom prompt
#   ./bin/test-with-speech.sh --voiceover          # Start VoiceOver first (macOS)
#   ./bin/test-with-speech.sh --say                # Pipe through macOS `say`
#
# Screen reader options by platform:
#   macOS:   VoiceOver (built-in) — Cmd+F5 to toggle, or pass --voiceover
#   Windows: NVDA (free) — https://www.nvaccess.org/download/
#   Linux:   Orca (built-in on GNOME) — Super+Alt+S to toggle
#
# The --say flag is the fastest way to demo on macOS without a full screen reader.
# It pipes claude-sr output through the `say` command for instant text-to-speech.

set -euo pipefail

DEFAULT_PROMPT="Explain how to print hello world in python, with a code example"
USE_VOICEOVER=false
USE_SAY=false
PROMPT=""

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --voiceover)
      USE_VOICEOVER=true
      shift
      ;;
    --say)
      USE_SAY=true
      shift
      ;;
    *)
      PROMPT="$1"
      shift
      ;;
  esac
done

PROMPT="${PROMPT:-$DEFAULT_PROMPT}"

# Resolve claude-sr path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_SR="$SCRIPT_DIR/claude-sr.js"

if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required. Install from https://nodejs.org" >&2
  exit 1
fi

# macOS VoiceOver
if $USE_VOICEOVER; then
  if [[ "$(uname)" != "Darwin" ]]; then
    echo "Error: --voiceover is macOS only. Use NVDA (Windows) or Orca (Linux)." >&2
    exit 1
  fi
  echo "Starting VoiceOver..."
  # Toggle VoiceOver on via AppleScript
  osascript -e 'tell application "System Events" to key code 96 using {command down}' 2>/dev/null || true
  sleep 2
  echo "VoiceOver should be active. Running claude-sr..."
  echo ""
fi

if $USE_SAY; then
  if ! command -v say &>/dev/null; then
    echo "Error: 'say' command not found. This flag is macOS only." >&2
    exit 1
  fi
  echo "Running claude-sr and piping to speech..."
  echo "Prompt: $PROMPT"
  echo ""

  # Run claude-sr, show the text AND speak it
  OUTPUT=$(node "$CLAUDE_SR" "$PROMPT" 2>/dev/null)
  echo "$OUTPUT"
  echo ""
  echo "--- Speaking output ---"
  echo "$OUTPUT" | say -r 200
  echo "Done."
else
  echo "Running: claude-sr \"$PROMPT\""
  echo ""
  echo "Tip: Turn on your screen reader first to hear the difference!"
  echo "  macOS:   Cmd+F5 (VoiceOver)"
  echo "  Windows: Install NVDA from https://www.nvaccess.org/download/"
  echo "  Linux:   Super+Alt+S (Orca)"
  echo ""
  echo "Or re-run with --say for instant macOS text-to-speech demo."
  echo "---"
  echo ""
  node "$CLAUDE_SR" "$PROMPT"
fi
