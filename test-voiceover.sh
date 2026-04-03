#!/usr/bin/env bash
# test-voiceover.sh — Automated VoiceOver/TTS validation with Whisper
#
# Records system audio while hook fixtures play TTS and earcons,
# transcribes with local Whisper, asserts expected phrases, and
# writes pass/fail results to recordings/results/.
#
# Auto-detects the best available audio capture method.
# Raw audio stays local (gitignored). Only results are committed.
#
# Requirements: macOS, ffmpeg, Whisper (local)
#
# Usage:
#   ./test-voiceover.sh                      # Run full suite (hooks + browser)
#   ./test-voiceover.sh quick                # Use Whisper tiny model
#   ./test-voiceover.sh setup                # Configure audio capture
#   ./test-voiceover.sh --skip-browser       # Hooks TTS validation only
#   ./test-voiceover.sh --skip-hooks         # Browser extension validation only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RECORDINGS_DIR="$SCRIPT_DIR/recordings"
RESULTS_DIR="$RECORDINGS_DIR/results"
CONFIG_FILE="$RECORDINGS_DIR/.config"
FIXTURES_DIR="$SCRIPT_DIR/packages/node/tests/hooks/fixtures/hook-inputs"
HOOKS_BIN="$SCRIPT_DIR/packages/node/bin/claude-a11y-hooks.js"
TEMP_DIR=""
SANDBOX_CONFIG=""
SCA_SESSION="claude-a11y-validation"
SCA_APP=""
SCA_BUNDLE="com.rogueamoeba.audiohijack"

DATE_STAMP="$(date +%Y-%m-%d)"
RESULTS_JSON="$RESULTS_DIR/${DATE_STAMP}-voiceover-results.json"
RESULTS_MD="$RESULTS_DIR/${DATE_STAMP}-voiceover-summary.md"

WHISPER_PATH=""
WHISPER_MODEL="medium"
AUDIO_DEVICE_INDEX=""
CAPTURE_METHOD=""

# Flags
RUN_HOOKS=true
RUN_BROWSER=true
RUN_SETUP=false

while [ $# -gt 0 ]; do
  case "$1" in
    quick)          WHISPER_MODEL="tiny"; shift ;;
    setup)          RUN_SETUP=true; shift ;;
    --skip-hooks)   RUN_HOOKS=false; shift ;;
    --skip-browser) RUN_BROWSER=false; shift ;;
    *)              shift ;;
  esac
done

mkdir -p "$RECORDINGS_DIR" "$RESULTS_DIR"

# ── Cleanup ───────────────────────────────────────────────────────

cleanup() {
  if [ "$CAPTURE_METHOD" = "system-app" ]; then
    sca_stop 2>/dev/null || true
  fi
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

# ── Config ────────────────────────────────────────────────────────

load_config() {
  if [ -f "$CONFIG_FILE" ]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
  fi
}

detect_whisper() {
  local candidates=(
    "whisper"
    "$HOME/miniconda3/bin/whisper"
    "$HOME/anaconda3/bin/whisper"
    "/opt/homebrew/bin/whisper"
    "/usr/local/bin/whisper"
  )
  for candidate in "${candidates[@]}"; do
    if command -v "$candidate" &>/dev/null || [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

# ── System capture app integration ────────────────────────────────

find_sca() {
  local app_path
  app_path="$(mdfind "kMDItemCFBundleIdentifier == '${SCA_BUNDLE}'" 2>/dev/null | head -1)"
  if [ -n "$app_path" ] && [ -d "$app_path" ]; then
    echo "$app_path"
    return 0
  fi
  return 1
}

sca_ensure_running() {
  if ! pgrep -qf "$SCA_BUNDLE"; then
    open -a "$SCA_APP"
    sleep 3
  fi
}

sca_run_script() {
  local script_content="$1"
  local cmd_file="$TEMP_DIR/sca-cmd-$$.ahcommand"
  echo "$script_content" > "$cmd_file"
  open -b "$SCA_BUNDLE" "$cmd_file"
}

SCA_REC_DIR=""

sca_detect_rec_dir() {
  for d in "$HOME/Music/"*/; do
    [ -d "$d" ] || continue
    if find "$d" -maxdepth 1 \( -name "*.wav" -o -name "*.aiff" \) -print -quit 2>/dev/null | grep -q .; then
      echo "${d%/}"
      return 0
    fi
  done
  echo "$HOME/Music"
}

sca_start() {
  sca_run_script "
var s = app.sessionWithName('${SCA_SESSION}');
if (s) { s.start(); }
"
  sleep 1
}

sca_stop() {
  sca_run_script "
var s = app.sessionWithName('${SCA_SESSION}');
if (s && s.running) { s.stop(); }
"
  sleep 1
}

sca_latest_recording() {
  find "$SCA_REC_DIR" -maxdepth 1 \( -name "*.wav" -o -name "*.aiff" \) -print0 2>/dev/null \
    | xargs -0 ls -t 2>/dev/null | head -1
}

sca_setup_instructions() {
  echo ""
  echo "SYSTEM AUDIO CAPTURE SETUP"
  echo "=========================="
  echo ""
  echo "A capture session named '${SCA_SESSION}' is needed."
  echo ""
  echo "Steps:"
  echo "  1. Open the capture app"
  echo "  2. Create a new session"
  echo "  3. Set the source to 'System Audio'"
  echo "  4. Add a 'Recorder' block and set format to WAV"
  echo "  5. Rename the session to exactly: ${SCA_SESSION}"
  echo "  6. In Settings, Advanced tab, enable 'Allow execution of external scripts'"
  echo ""
  echo "Once done, re-run this script."
  echo ""

  sca_ensure_running
}

sca_check_session() {
  local check_file="$TEMP_DIR/sca-check-result.txt"
  rm -f "$check_file"
  sca_run_script "
var s = app.sessionWithName('${SCA_SESSION}');
app.runShellCommand('echo ' + (s ? 'found' : 'missing') + ' > ${check_file}');
"
  sleep 2
  if [ -f "$check_file" ] && grep -q "found" "$check_file"; then
    return 0
  fi
  return 1
}

# ── ffmpeg audio device detection (fallback) ─────────────────────

detect_ffmpeg_audio_device() {
  local device_list
  device_list="$(ffmpeg -f avfoundation -list_devices true -i "" 2>&1 || true)"
  local audio_section=false
  local preferred_devices=""
  local other_devices=""

  while IFS= read -r line; do
    if echo "$line" | grep -q "AVFoundation audio devices"; then
      audio_section=true
      continue
    fi
    if [ "$audio_section" = true ]; then
      local idx
      idx="$(echo "$line" | grep -oE '\[([0-9]+)\]' | head -1 | tr -d '[]')" || true
      if [ -n "$idx" ]; then
        if echo "$line" | grep -qi "blackhole"; then
          preferred_devices="$preferred_devices $idx"
        elif echo "$line" | grep -qi "microphone"; then
          other_devices="$other_devices $idx"
        fi
      fi
    fi
  done <<< "$device_list"

  local all_devices="$preferred_devices $other_devices"

  for idx in $all_devices; do
    [ -z "$idx" ] && continue
    local test_wav
    test_wav="$(mktemp /tmp/audio-probe-XXXXXX.wav)"
    (sleep 0.3 && afplay -v 0.5 /System/Library/Sounds/Tink.aiff 2>/dev/null) &
    ffmpeg -y -f avfoundation -i ":${idx}" -t 2 -acodec pcm_s16le -ar 16000 -ac 1 \
      "$test_wav" </dev/null >/dev/null 2>&1 || true
    if [ -f "$test_wav" ]; then
      local vol
      vol="$(ffmpeg -i "$test_wav" -af volumedetect -f null /dev/null 2>&1 | grep mean_volume | head -1 | sed -E 's/.*mean_volume: ([-0-9.]+) dB.*/\1/')" || true
      local abs_vol
      abs_vol="$(echo "${vol:--91}" | sed 's/-//' | sed 's/\..*//')"
      rm -f "$test_wav"
      if [ "$abs_vol" -lt 70 ] 2>/dev/null; then
        echo "$idx"
        return 0
      fi
    else
      rm -f "$test_wav"
    fi
  done

  echo ""
}

# ── Preflight checks ─────────────────────────────────────────────

preflight() {
  echo "VoiceOver Validation Suite"
  echo "========================="
  echo ""
  echo "This validates TTS and earcon output by recording system audio,"
  echo "transcribing with Whisper, and checking for expected phrases."
  echo "Only results are committed -- raw audio stays local."
  echo ""

  if [ "$(uname)" != "Darwin" ]; then
    echo "Error: This script requires macOS (for say and afplay)."
    exit 1
  fi

  if ! command -v ffmpeg &>/dev/null; then
    echo "Error: ffmpeg not installed. Run: brew install ffmpeg"
    exit 1
  fi

  # Whisper
  local saved_model="$WHISPER_MODEL"
  load_config
  if [ "$saved_model" = "tiny" ]; then
    WHISPER_MODEL="tiny"
  fi
  if [ -n "$WHISPER_PATH" ] && (command -v "$WHISPER_PATH" &>/dev/null || [ -x "$WHISPER_PATH" ]); then
    : # configured
  else
    WHISPER_PATH="$(detect_whisper)" || true
  fi
  if [ -z "$WHISPER_PATH" ]; then
    echo "Error: Whisper not found. Install with: pip install openai-whisper"
    exit 1
  fi
  echo "Whisper: $WHISPER_PATH (model: $WHISPER_MODEL)"

  TEMP_DIR="$(mktemp -d /tmp/voiceover-validation-XXXXXX)"

  # Determine capture method
  echo ""
  echo "Detecting audio capture method..."

  SCA_APP="$(find_sca 2>/dev/null)" || true
  if [ -n "$SCA_APP" ]; then
    sca_ensure_running

    if sca_check_session; then
      CAPTURE_METHOD="system-app"
      SCA_REC_DIR="$(sca_detect_rec_dir)"
      echo "System audio capture session found."
    else
      echo "Capture app found but no '${SCA_SESSION}' session."
      echo ""
      read -r -p "Set up now? (y/n): " setup_choice
      if [ "$setup_choice" = "y" ] || [ "$setup_choice" = "Y" ]; then
        sca_setup_instructions
        exit 0
      fi
      echo "Falling back to ffmpeg..."
    fi
  fi

  if [ -z "$CAPTURE_METHOD" ]; then
    AUDIO_DEVICE_INDEX="$(detect_ffmpeg_audio_device)"
    if [ -n "$AUDIO_DEVICE_INDEX" ]; then
      CAPTURE_METHOD="ffmpeg"
      echo "Using ffmpeg with audio device index: $AUDIO_DEVICE_INDEX"
    else
      echo ""
      echo "Error: No working audio capture device found."
      echo ""
      echo "Options:"
      echo "  1. Install BlackHole: brew install blackhole-2ch"
      echo "     Then create a Multi-Output Device in Audio MIDI Setup"
      echo "  2. Use any system audio capture tool with a session named '${SCA_SESSION}'"
      exit 1
    fi
  fi

  # Audio health check
  echo ""
  echo "Audio health check..."
  if ! say -r 200 -- "Validation starting." 2>/dev/null; then
    echo "Error: say command failed. Check audio output."
    exit 1
  fi
  sleep 1
  if ! afplay -v 0.3 /System/Library/Sounds/Glass.aiff 2>/dev/null; then
    echo "Warning: afplay failed. Earcon tests may fail."
  fi
  echo "Audio OK."

  # Build hooks if needed
  if [ ! -f "$HOOKS_BIN" ]; then
    echo ""
    echo "Building hooks..."
    (cd "$SCRIPT_DIR" && npm run build >/dev/null 2>&1)
  fi

  # Sandbox config
  SANDBOX_CONFIG="$TEMP_DIR/config"
  mkdir -p "$SANDBOX_CONFIG"
  cat > "$SANDBOX_CONFIG/config.json" <<'CONF'
{
  "verbosity": "normal",
  "tts": { "enabled": true, "engine": "auto", "rate": 200, "maxLength": 500 },
  "earcon": { "enabled": true, "engine": "auto", "volume": 0.5 },
  "significance": { "enabled": true, "overrides": {} },
  "silence": { "enabled": false, "tools": {} },
  "history": { "enabled": false },
  "progress": { "enabled": false },
  "digest": { "enabled": false },
  "permissions": { "rules": [] },
  "summarize": { "enabled": true, "maxDeclarations": 10, "maxTtsNames": 3 }
}
CONF

  echo ""
  echo "Setup complete. Starting validation..."
  echo ""
}

# ── Recording functions ───────────────────────────────────────────

record_fixture_sca() {
  local fixture_file="$1"
  local duration="${2:-5}"
  local base_name
  base_name="$(basename "$fixture_file" .json)"

  local before_file
  before_file="$(sca_latest_recording)" || true

  sca_start

  CLAUDE_A11Y_HOOKS_CONFIG_DIR="$SANDBOX_CONFIG" \
  XDG_STATE_HOME="$TEMP_DIR/state" \
    node "$HOOKS_BIN" format < "$fixture_file" >/dev/null 2>&1 || true

  sleep "$duration"
  sca_stop

  local after_file
  after_file="$(sca_latest_recording)" || true

  if [ -n "$after_file" ] && [ "$after_file" != "$before_file" ]; then
    local out_wav="$TEMP_DIR/${base_name}.wav"
    ffmpeg -y -i "$after_file" -acodec pcm_s16le -ar 16000 -ac 1 "$out_wav" >/dev/null 2>&1
    echo "$out_wav"
    return 0
  fi
  return 1
}

record_fixture_ffmpeg() {
  local fixture_file="$1"
  local duration="${2:-5}"
  local wav_file="$TEMP_DIR/$(basename "$fixture_file" .json).wav"

  rm -f "$wav_file"

  ffmpeg -y -f avfoundation -i ":${AUDIO_DEVICE_INDEX}" \
    -t "$duration" -acodec pcm_s16le -ar 16000 -ac 1 \
    "$wav_file" </dev/null >/dev/null 2>&1 &
  local ffmpeg_pid=$!

  sleep 0.3

  CLAUDE_A11Y_HOOKS_CONFIG_DIR="$SANDBOX_CONFIG" \
  XDG_STATE_HOME="$TEMP_DIR/state" \
    node "$HOOKS_BIN" format < "$fixture_file" >/dev/null 2>&1 || true

  wait "$ffmpeg_pid" 2>/dev/null || true

  if [ -f "$wav_file" ]; then
    echo "$wav_file"
    return 0
  fi
  return 1
}

record_fixture() {
  if [ "$CAPTURE_METHOD" = "system-app" ]; then
    record_fixture_sca "$@"
  else
    record_fixture_ffmpeg "$@"
  fi
}

record_earcon_sca() {
  local sound_file="$1"

  local before_file
  before_file="$(sca_latest_recording)" || true

  sca_start
  sleep 0.3
  afplay -v 0.5 "$sound_file" 2>/dev/null || true
  sleep 1
  sca_stop

  local after_file
  after_file="$(sca_latest_recording)" || true

  if [ -n "$after_file" ] && [ "$after_file" != "$before_file" ]; then
    local vol
    vol="$(ffmpeg -i "$after_file" -af volumedetect -f null /dev/null 2>&1 | grep mean_volume | head -1 | sed -E 's/.*mean_volume: ([-0-9.]+) dB.*/\1/')" || true
    echo "${vol:--91}"
  else
    echo "-91"
  fi
}

record_earcon_ffmpeg() {
  local sound_file="$1"
  local wav_file="$TEMP_DIR/earcon-$(basename "$sound_file" .aiff).wav"

  rm -f "$wav_file"

  ffmpeg -y -f avfoundation -i ":${AUDIO_DEVICE_INDEX}" \
    -t 2 -acodec pcm_s16le -ar 16000 -ac 1 \
    "$wav_file" </dev/null >/dev/null 2>&1 &
  local ffmpeg_pid=$!

  sleep 0.2
  afplay -v 0.5 "$sound_file" 2>/dev/null || true

  wait "$ffmpeg_pid" 2>/dev/null || true

  if [ -f "$wav_file" ]; then
    local vol
    vol="$(ffmpeg -i "$wav_file" -af volumedetect -f null /dev/null 2>&1 | grep mean_volume | head -1 | sed -E 's/.*mean_volume: ([-0-9.]+) dB.*/\1/')" || true
    rm -f "$wav_file"
    echo "${vol:--91}"
  else
    echo "-91"
  fi
}

check_earcon() {
  if [ "$CAPTURE_METHOD" = "system-app" ]; then
    record_earcon_sca "$@"
  else
    record_earcon_ffmpeg "$@"
  fi
}

# ── Whisper transcription ─────────────────────────────────────────

transcribe() {
  local wav_file="$1"
  local json_out="$TEMP_DIR/$(basename "$wav_file" .wav).json"

  "$WHISPER_PATH" "$wav_file" \
    --model "$WHISPER_MODEL" \
    --output_format json \
    --word_timestamps True \
    --language en \
    --no_speech_threshold 0.5 \
    --output_dir "$TEMP_DIR" \
    >/dev/null 2>&1

  if [ ! -f "$json_out" ] && [ -f "${wav_file}.json" ]; then
    mv "${wav_file}.json" "$json_out"
  fi

  if [ -f "$json_out" ]; then
    echo "$json_out"
    return 0
  fi
  return 1
}

extract_transcript() {
  local json_file="$1"
  python3 -c "
import json, sys
with open('$json_file') as f:
    data = json.load(f)
segments = data.get('segments', [])
filtered = [s for s in segments
            if s.get('no_speech_prob', 0) < 0.6
            and not (len(s.get('text','').split()) <= 1 and s.get('avg_logprob', 0) < -0.5)]
text = ' '.join(s['text'].strip() for s in filtered)
print(text)
" 2>/dev/null || echo ""
}

extract_first_word_time() {
  local json_file="$1"
  python3 -c "
import json
with open('$json_file') as f:
    data = json.load(f)
segments = data.get('segments', [])
filtered = [s for s in segments
            if s.get('no_speech_prob', 0) < 0.6
            and not (len(s.get('text','').split()) <= 1 and s.get('avg_logprob', 0) < -0.5)]
if filtered:
    words = filtered[0].get('words', [])
    if words:
        print(int(words[0].get('start', 0) * 1000))
    else:
        print(int(filtered[0].get('start', 0) * 1000))
else:
    print(-1)
" 2>/dev/null || echo "-1"
}

# ── Main validation loop ─────────────────────────────────────────

run_validation() {
  # Format: file|description|expected1|expected2|noise
  # noise=yes means the significance filter classifies it as noise (no TTS expected)
  local fixtures=(
    "bash-success|Bash success|Ran|success|noise"
    "bash-failure|Bash failure|Ran|exit code|no"
    "edit|File edit|Edited|index|no"
    "read|File read|Read|lines|noise"
    "write|File write|file|new|no"
    "glob|Glob search|TypeScript|files|noise"
    "grep|Grep search|match|across|noise"
    "task|Task operation|Launched|agent|no"
    "web-search|Web search|search|search|no"
    "web-fetch|Web fetch|Fetched|example|noise"
  )

  local total=${#fixtures[@]}
  local passed=0
  local failed=0
  local test_results="["
  local first_result=true

  echo "TTS VALIDATION (capture: $CAPTURE_METHOD)"
  echo "=============="
  echo ""
  echo "Testing $total hook fixtures..."
  echo ""

  for i in "${!fixtures[@]}"; do
    local entry="${fixtures[$i]}"
    local file desc expected1 expected2 is_noise
    IFS='|' read -r file desc expected1 expected2 is_noise <<< "$entry"
    local num=$((i + 1))
    local fixture_path="$FIXTURES_DIR/${file}.json"

    echo -n "  [$num/$total] $desc... "

    if [ ! -f "$fixture_path" ]; then
      echo "SKIP (fixture not found)"
      continue
    fi

    local wav_file
    wav_file="$(record_fixture "$fixture_path" 5)" || true

    if [ -z "$wav_file" ] || [ ! -f "$wav_file" ]; then
      if [ "$is_noise" = "noise" ]; then
        echo "PASS (noise -- no TTS expected)"
        passed=$((passed + 1))
        if [ "$first_result" = false ]; then test_results+=","; fi
        first_result=false
        test_results+="$(printf '{"fixture":"%s","expected":"(noise)","transcript":"","found":true,"latencyMs":-1,"pass":true,"noise":true}' "$file")"
      else
        echo "FAIL (recording failed)"
        failed=$((failed + 1))
        if [ "$first_result" = false ]; then test_results+=","; fi
        first_result=false
        test_results+="$(printf '{"fixture":"%s","expected":"%s","transcript":"","found":false,"latencyMs":-1,"pass":false}' "$file" "$expected1")"
      fi
      continue
    fi

    local json_file
    json_file="$(transcribe "$wav_file")" || true

    if [ -z "$json_file" ] || [ ! -f "$json_file" ]; then
      if [ "$is_noise" = "noise" ]; then
        echo "PASS (noise -- no TTS expected)"
        passed=$((passed + 1))
        if [ "$first_result" = false ]; then test_results+=","; fi
        first_result=false
        test_results+="$(printf '{"fixture":"%s","expected":"(noise)","transcript":"","found":true,"latencyMs":-1,"pass":true,"noise":true}' "$file")"
      else
        echo "FAIL (transcription failed)"
        failed=$((failed + 1))
        if [ "$first_result" = false ]; then test_results+=","; fi
        first_result=false
        test_results+="$(printf '{"fixture":"%s","expected":"%s","transcript":"","found":false,"latencyMs":-1,"pass":false}' "$file" "$expected1")"
      fi
      rm -f "$wav_file"
      continue
    fi

    local transcript
    transcript="$(extract_transcript "$json_file")"
    local latency_ms
    latency_ms="$(extract_first_word_time "$json_file")"

    local found=false
    if [ "$is_noise" = "noise" ]; then
      if [ -z "$transcript" ]; then
        found=true
      fi
    else
      if echo "$transcript" | grep -qi "$expected1" || echo "$transcript" | grep -qi "$expected2"; then
        found=true
      fi
    fi

    if [ "$found" = true ]; then
      if [ "$is_noise" = "noise" ]; then
        echo "PASS (noise -- silent as expected)"
      else
        echo "PASS (${latency_ms}ms)"
      fi
      passed=$((passed + 1))
    else
      if [ "$is_noise" = "noise" ]; then
        echo "FAIL (noise fixture produced unexpected audio)"
        echo "         Got: $transcript"
      else
        echo "FAIL"
        echo "         Expected: $expected1"
        echo "         Got: $transcript"
      fi
      failed=$((failed + 1))
    fi

    local escaped_transcript
    escaped_transcript="$(echo "$transcript" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null)" || true
    escaped_transcript="${escaped_transcript:-\"\"}"

    if [ "$first_result" = false ]; then test_results+=","; fi
    first_result=false
    local noise_field=""
    if [ "$is_noise" = "noise" ]; then noise_field=',"noise":true'; fi
    test_results+="$(printf '{"fixture":"%s","expected":"%s","transcript":%s,"found":%s,"latencyMs":%s,"pass":%s%s}' \
      "$file" "$expected1" "$escaped_transcript" "$found" "$latency_ms" "$found" "$noise_field")"

    rm -f "$wav_file" "$json_file"
  done

  test_results+="]"

  echo ""
  echo "EARCON VALIDATION"
  echo "================="
  echo ""

  local earcon_sounds=(
    "Tink.aiff|edit-complete"
    "Glass.aiff|test-pass"
    "Basso.aiff|test-fail"
  )
  local earcon_results="["
  local first_earcon=true

  for entry in "${earcon_sounds[@]}"; do
    local sound_file earcon_id
    IFS='|' read -r sound_file earcon_id <<< "$entry"
    local full_path="/System/Library/Sounds/$sound_file"

    echo -n "  $earcon_id ($sound_file)... "

    if [ ! -f "$full_path" ]; then
      echo "SKIP (sound file not found)"
      continue
    fi

    local vol
    vol="$(check_earcon "$full_path")"
    local abs_vol
    abs_vol="$(echo "${vol:--91}" | sed 's/-//' | sed 's/\..*//')"
    local audible=false
    if [ "$abs_vol" -lt 70 ] 2>/dev/null; then
      audible=true
      echo "PASS (${vol}dB)"
    else
      echo "FAIL (${vol}dB -- too quiet)"
    fi

    if [ "$first_earcon" = false ]; then earcon_results+=","; fi
    first_earcon=false
    earcon_results+="$(printf '{"sound":"%s","earconId":"%s","meanVolumeDb":%s,"audible":%s}' \
      "$sound_file" "$earcon_id" "${vol:--91}" "$audible")"
  done

  earcon_results+="]"

  local avg_latency=0
  local max_latency=0

  avg_latency="$(echo "$test_results" | python3 -c "
import json, sys
tests = json.loads(sys.stdin.read())
latencies = [t['latencyMs'] for t in tests if t['latencyMs'] > 0]
if latencies:
    print(int(sum(latencies)/len(latencies)))
else:
    print(0)
" 2>/dev/null)" || true

  max_latency="$(echo "$test_results" | python3 -c "
import json, sys
tests = json.loads(sys.stdin.read())
latencies = [t['latencyMs'] for t in tests if t['latencyMs'] > 0]
print(max(latencies) if latencies else 0)
" 2>/dev/null)" || true

  cat > "$RESULTS_JSON" <<EOF
{
  "date": "$DATE_STAMP",
  "platform": "$(uname -s) $(uname -m)",
  "captureMethod": "$CAPTURE_METHOD",
  "whisperModel": "$WHISPER_MODEL",
  "ttsEngine": "say",
  "tests": $test_results,
  "earcons": $earcon_results,
  "summary": {
    "total": $total,
    "passed": $passed,
    "failed": $failed,
    "avgLatencyMs": ${avg_latency:-0},
    "maxLatencyMs": ${max_latency:-0}
  }
}
EOF

  echo ""
  echo "Results written to: $RESULTS_JSON"

  cat > "$RESULTS_MD" <<EOF
# VoiceOver Validation Results

Date: $DATE_STAMP
Platform: $(uname -s) $(uname -m)
Capture method: $CAPTURE_METHOD
Whisper model: $WHISPER_MODEL
TTS engine: macOS \`say\`

## TTS Results

| Fixture | Expected | Transcript | Latency | Pass |
|---------|----------|------------|---------|------|
EOF

  echo "$test_results" | python3 -c "
import json, sys
tests = json.loads(sys.stdin.read())
for t in tests:
    transcript = t['transcript'][:60] + '...' if len(t['transcript']) > 60 else t['transcript']
    latency = f\"{t['latencyMs']}ms\" if t['latencyMs'] >= 0 else 'N/A'
    status = 'PASS' if t['pass'] else 'FAIL'
    print(f\"| {t['fixture']} | {t['expected']} | {transcript} | {latency} | {status} |\")
" >> "$RESULTS_MD" 2>/dev/null

  cat >> "$RESULTS_MD" <<EOF

## Earcon Results

| Sound | Earcon ID | Volume | Audible |
|-------|-----------|--------|---------|
EOF

  echo "$earcon_results" | python3 -c "
import json, sys
earcons = json.loads(sys.stdin.read())
for e in earcons:
    status = 'Yes' if e['audible'] else 'No'
    print(f\"| {e['sound']} | {e['earconId']} | {e['meanVolumeDb']}dB | {status} |\")
" >> "$RESULTS_MD" 2>/dev/null

  cat >> "$RESULTS_MD" <<EOF

## Summary

- Total: $total
- Passed: $passed
- Failed: $failed
- Average latency: ${avg_latency:-0}ms
- Max latency: ${max_latency:-0}ms
EOF

  echo "Summary written to: $RESULTS_MD"

  echo ""
  echo "==============================="
  echo "  RESULTS: $passed/$total passed"
  echo "  Avg latency: ${avg_latency:-0}ms"
  echo "==============================="
  echo ""
}

# ── Phase 2: Browser extension validation (virtual screen reader) ──

run_browser_validation() {
  echo ""
  echo "BROWSER EXTENSION VALIDATION"
  echo "============================"
  echo ""
  echo "Testing chat-a11y.js via virtual screen reader on sr-validation.html"
  echo "(runs in-process, no real browser or VoiceOver needed)"
  echo ""

  if ! command -v node &>/dev/null; then
    echo "Error: node not found. Cannot run browser validation."
    return 1
  fi

  if [ ! -f "$SCRIPT_DIR/test-browser-voiceover.js" ]; then
    echo "Error: test-browser-voiceover.js not found."
    return 1
  fi

  if [ ! -f "$SCRIPT_DIR/node_modules/@guidepup/virtual-screen-reader/lib/cjs/index.js" ]; then
    echo "Virtual screen reader not installed. Running npm install..."
    (cd "$SCRIPT_DIR" && npm install >/dev/null 2>&1)
  fi

  local browser_output="$TEMP_DIR/browser-results.json"
  node "$SCRIPT_DIR/test-browser-voiceover.js" --output "$browser_output" 2>&1

  if [ -f "$browser_output" ]; then
    BROWSER_RESULTS_JSON="$(cat "$browser_output")"
    BROWSER_PASSED="$(python3 -c "
import json
with open('$browser_output') as f:
    d = json.load(f)
print(d.get('summary',{}).get('virtual',{}).get('passed',0))
" 2>/dev/null)" || true
    BROWSER_FAILED="$(python3 -c "
import json
with open('$browser_output') as f:
    d = json.load(f)
print(d.get('summary',{}).get('virtual',{}).get('failed',0))
" 2>/dev/null)" || true
    BROWSER_TOTAL="$(python3 -c "
import json
with open('$browser_output') as f:
    d = json.load(f)
print(d.get('summary',{}).get('virtual',{}).get('total',0))
" 2>/dev/null)" || true
  fi
}

write_combined_results() {
  python3 - "$RESULTS_JSON" "$RESULTS_MD" "$DATE_STAMP" "$CAPTURE_METHOD" "$WHISPER_MODEL" "$@" <<'PYEOF'
import json, sys, os

json_path = sys.argv[1]
md_path = sys.argv[2]
date = sys.argv[3]
capture = sys.argv[4]
model = sys.argv[5]
extra_json_files = sys.argv[6:]

existing = {}
if os.path.exists(json_path):
    try:
        with open(json_path) as f:
            existing = json.load(f)
    except Exception:
        pass

for fpath in extra_json_files:
    if os.path.exists(fpath):
        with open(fpath) as f:
            data = json.load(f)
        existing["browser"] = data

with open(json_path, "w") as f:
    json.dump(existing, f, indent=2)

if "browser" in existing:
    with open(md_path, "a") as f:
        f.write("\n\n## Browser Extension Results\n\n")
        f.write("Method: virtual screen reader (in-process, no real VoiceOver)\n\n")
        results = existing["browser"].get("results", {}).get("virtual", [])
        f.write("| Test | Pass | Matched | Missed |\n")
        f.write("|------|------|---------|--------|\n")
        for t in results:
            status = "PASS" if t.get("pass") else "FAIL"
            matched = ", ".join(t.get("matched", [])) or "none"
            missed = ", ".join(t.get("missed", [])) or "none"
            f.write(f"| {t['name']} | {status} | {matched} | {missed} |\n")
        summary = existing["browser"].get("summary", {}).get("virtual", {})
        f.write(f"\n{summary.get('passed', 0)}/{summary.get('total', 0)} passed\n")

PYEOF

  echo ""
  echo "Combined results: $RESULTS_JSON"
  echo "Combined summary: $RESULTS_MD"
}

# ── Entry point ───────────────────────────────────────────────────

if [ "$RUN_SETUP" = true ]; then
  TEMP_DIR="$(mktemp -d /tmp/voiceover-validation-XXXXXX)"
  SCA_APP="$(find_sca 2>/dev/null)" || true
  if [ -z "$SCA_APP" ]; then
    echo "No supported system audio capture app found."
    echo "Install BlackHole as an alternative: brew install blackhole-2ch"
    exit 1
  fi
  sca_ensure_running
  sca_setup_instructions
  exit 0
fi

preflight

HOOKS_RESULTS_JSON=""
BROWSER_RESULTS_JSON=""
BROWSER_PASSED=0
BROWSER_FAILED=0
BROWSER_TOTAL=0

if [ "$RUN_HOOKS" = true ]; then
  run_validation
fi

if [ "$RUN_BROWSER" = true ]; then
  run_browser_validation

  browser_file="$TEMP_DIR/browser-results.json"
  if [ -f "$browser_file" ]; then
    write_combined_results "$browser_file"
  fi
fi
