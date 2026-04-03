#!/usr/bin/env bash
# test-record.sh — Screen + audio recording with local Whisper analysis
#
# Captures screen and system audio via ffmpeg, then transcribes with a
# local Whisper model and generates a latency report.
#
# Usage:
#   ./test-record.sh setup              # Interactive first-time config
#   ./test-record.sh start              # Begin recording in background
#   ./test-record.sh stop               # Stop recording, transcribe, report
#   ./test-record.sh analyze [file.mp4] # Transcribe an existing recording
#   ./test-record.sh report [file.json] # Regenerate report from transcript

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RECORDINGS_DIR="$SCRIPT_DIR/recordings"
CONFIG_FILE="$RECORDINGS_DIR/.config"
PID_FILE="$RECORDINGS_DIR/.ffmpeg.pid"
CURRENT_FILE="$RECORDINGS_DIR/.current"

mkdir -p "$RECORDINGS_DIR"

# ── Config helpers ─────────────────────────────────────────────────

load_config() {
  WHISPER_PATH=""
  WHISPER_MODEL="medium"
  AUDIO_DEVICE=""
  AUDIO_DEVICE_INDEX=""
  SCREEN_DEVICE_INDEX=""

  if [ -f "$CONFIG_FILE" ]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
  fi
}

save_config() {
  cat > "$CONFIG_FILE" <<EOF
WHISPER_PATH="$WHISPER_PATH"
WHISPER_MODEL="$WHISPER_MODEL"
AUDIO_DEVICE="$AUDIO_DEVICE"
AUDIO_DEVICE_INDEX="$AUDIO_DEVICE_INDEX"
SCREEN_DEVICE_INDEX="$SCREEN_DEVICE_INDEX"
EOF
  echo "Config saved to $CONFIG_FILE"
}

# ── Auto-detection ─────────────────────────────────────────────────

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

detect_whisper_models() {
  local cache_dir="$HOME/.cache/whisper"
  if [ -d "$cache_dir" ]; then
    local models=()
    for f in "$cache_dir"/*.pt; do
      [ -f "$f" ] || continue
      local name
      name="$(basename "$f" .pt)"
      models+=("$name")
    done
    if [ ${#models[@]} -gt 0 ]; then
      echo "${models[*]}"
      return 0
    fi
  fi
  return 1
}

# ── Setup command ──────────────────────────────────────────────────

cmd_setup() {
  echo "Recording Setup"
  echo "==============="
  echo ""
  echo "This configures your local recording and Whisper environment."
  echo "Settings are stored in recordings/.config (gitignored)."
  echo ""

  load_config

  # 1. Whisper path
  echo "Step 1: Whisper location"
  local detected
  if detected="$(detect_whisper)"; then
    echo "  Auto-detected: $detected"
    read -r -p "  Use this? (y/n, or enter a different path): " whisper_choice
    if [ "$whisper_choice" = "y" ] || [ "$whisper_choice" = "Y" ] || [ -z "$whisper_choice" ]; then
      WHISPER_PATH="$detected"
    elif [ "$whisper_choice" = "n" ] || [ "$whisper_choice" = "N" ]; then
      read -r -p "  Enter path to whisper binary: " WHISPER_PATH
    else
      WHISPER_PATH="$whisper_choice"
    fi
  else
    echo "  Whisper not found in common locations."
    read -r -p "  Enter path to whisper binary: " WHISPER_PATH
  fi

  if [ -z "$WHISPER_PATH" ]; then
    echo "  Warning: No whisper path set. Transcription will not work."
    echo "  You can re-run setup later: ./test-record.sh setup"
  else
    echo "  Using: $WHISPER_PATH"
  fi
  echo ""

  # 2. Whisper model
  echo "Step 2: Whisper model"
  local available_models
  if available_models="$(detect_whisper_models)"; then
    echo "  Downloaded models found: $available_models"
  else
    echo "  No downloaded models found in ~/.cache/whisper/"
    echo "  Whisper will download the model on first use."
  fi
  echo "  Options: tiny, base, small, medium, large"
  echo "  (tiny is fastest, medium is a good balance, large is most accurate)"
  read -r -p "  Model to use [${WHISPER_MODEL:-medium}]: " model_choice
  WHISPER_MODEL="${model_choice:-${WHISPER_MODEL:-medium}}"
  echo "  Using: $WHISPER_MODEL"
  echo ""

  # 3. Check ffmpeg
  if ! command -v ffmpeg &>/dev/null; then
    echo "Step 3: ffmpeg"
    echo "  ffmpeg is not installed. Recording requires ffmpeg."
    echo "  Install with: brew install ffmpeg"
    echo ""
    save_config
    return 1
  fi

  # 4. Audio device
  echo "Step 3: Audio capture device"
  echo "  Listing available audio input devices..."
  echo ""

  local device_list
  device_list="$(ffmpeg -f avfoundation -list_devices true -i "" 2>&1 || true)"

  local audio_section=false
  local audio_devices=()
  while IFS= read -r line; do
    if echo "$line" | grep -q "AVFoundation audio devices"; then
      audio_section=true
      continue
    fi
    if [ "$audio_section" = true ]; then
      local idx name
      if idx="$(echo "$line" | grep -oE '\[([0-9]+)\]' | tr -d '[]')" && \
         name="$(echo "$line" | sed -E 's/.*\] //')"; then
        if [ -n "$idx" ] && [ -n "$name" ]; then
          audio_devices+=("$idx:$name")
          echo "    [$idx] $name"
        fi
      fi
    fi
  done <<< "$device_list"

  if [ ${#audio_devices[@]} -eq 0 ]; then
    echo "  No audio devices detected."
    echo "  For system audio capture, install a loopback driver:"
    echo "    - BlackHole: brew install blackhole-2ch"
    echo "    - Or use BoomAudio, Soundflower, etc."
    read -r -p "  Enter audio device index manually (or press Enter to skip): " AUDIO_DEVICE_INDEX
  else
    read -r -p "  Enter the index number for your audio device [${AUDIO_DEVICE_INDEX:-0}]: " audio_choice
    AUDIO_DEVICE_INDEX="${audio_choice:-${AUDIO_DEVICE_INDEX:-0}}"
  fi

  for entry in "${audio_devices[@]}"; do
    local idx="${entry%%:*}"
    local name="${entry#*:}"
    if [ "$idx" = "$AUDIO_DEVICE_INDEX" ]; then
      AUDIO_DEVICE="$name"
      break
    fi
  done
  echo "  Using audio device: [$AUDIO_DEVICE_INDEX] ${AUDIO_DEVICE:-unknown}"
  echo ""

  # 5. Screen device
  echo "Step 4: Screen capture device"
  local video_section=false
  local video_devices=()
  while IFS= read -r line; do
    if echo "$line" | grep -q "AVFoundation video devices"; then
      video_section=true
      continue
    fi
    if echo "$line" | grep -q "AVFoundation audio devices"; then
      break
    fi
    if [ "$video_section" = true ]; then
      local idx name
      if idx="$(echo "$line" | grep -oE '\[([0-9]+)\]' | tr -d '[]')" && \
         name="$(echo "$line" | sed -E 's/.*\] //')"; then
        if [ -n "$idx" ] && [ -n "$name" ]; then
          video_devices+=("$idx:$name")
          if echo "$name" | grep -qi "capture screen"; then
            SCREEN_DEVICE_INDEX="${SCREEN_DEVICE_INDEX:-$idx}"
          fi
        fi
      fi
    fi
  done <<< "$device_list"

  if [ ${#video_devices[@]} -gt 0 ]; then
    echo "  Available screens:"
    for entry in "${video_devices[@]}"; do
      local idx="${entry%%:*}"
      local name="${entry#*:}"
      if echo "$name" | grep -qi "capture screen\|screen"; then
        echo "    [$idx] $name"
      fi
    done
  fi

  read -r -p "  Screen device index [${SCREEN_DEVICE_INDEX:-0}]: " screen_choice
  SCREEN_DEVICE_INDEX="${screen_choice:-${SCREEN_DEVICE_INDEX:-0}}"
  echo "  Using screen device: [$SCREEN_DEVICE_INDEX]"
  echo ""

  save_config
  echo ""
  echo "Setup complete. You can re-run setup any time: ./test-record.sh setup"
}

# ── Start command ──────────────────────────────────────────────────

cmd_start() {
  load_config

  if [ -f "$PID_FILE" ]; then
    local old_pid
    old_pid="$(cat "$PID_FILE")"
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "Recording is already running (PID: $old_pid)."
      echo "Run './test-record.sh stop' first."
      return 1
    fi
    rm -f "$PID_FILE"
  fi

  if ! command -v ffmpeg &>/dev/null; then
    echo "Error: ffmpeg is not installed. Install with: brew install ffmpeg"
    return 1
  fi

  if [ -z "$SCREEN_DEVICE_INDEX" ] || [ -z "$AUDIO_DEVICE_INDEX" ]; then
    echo "Recording not configured. Running setup first..."
    echo ""
    cmd_setup
    load_config
  fi

  # Verify audio loopback is capturing by recording a short test clip
  echo "Verifying audio capture..."
  local test_file="$RECORDINGS_DIR/.audio-test.wav"
  rm -f "$test_file"

  # Play a test tone and record simultaneously
  (sleep 0.3 && afplay -v 0.3 /System/Library/Sounds/Tink.aiff 2>/dev/null) &
  ffmpeg -y -f avfoundation -i ":${AUDIO_DEVICE_INDEX}" -t 2 -acodec pcm_s16le "$test_file" </dev/null >/dev/null 2>&1 || true

  if [ -f "$test_file" ]; then
    local audio_energy
    audio_energy="$(ffmpeg -i "$test_file" -af "volumedetect" -f null /dev/null 2>&1 | grep "mean_volume" | head -1 | sed -E 's/.*mean_volume: ([-0-9.]+) dB.*/\1/')" || true

    if [ -n "$audio_energy" ]; then
      local energy_int
      energy_int="$(echo "$audio_energy" | sed 's/-.*//' | sed 's/\..*//')"
      local abs_energy
      abs_energy="$(echo "$audio_energy" | sed 's/-//' | sed 's/\..*//')"
      if [ "$abs_energy" -lt 80 ] 2>/dev/null; then
        echo "  Audio loopback verified (level: ${audio_energy}dB)"
      else
        echo "  Warning: Audio level very low (${audio_energy}dB)."
        echo "  Your loopback device (${AUDIO_DEVICE:-device $AUDIO_DEVICE_INDEX}) may not be"
        echo "  capturing system audio. Recordings may contain silence."
        echo ""
        echo "  To fix this on macOS:"
        echo "    - If using BoomAudio: check it is set as a capture source in System Settings"
        echo "    - If using BlackHole: create a Multi-Output Device in Audio MIDI Setup"
        echo "      that combines your speakers + BlackHole, and set it as the output"
        echo ""
        read -r -p "  Continue anyway? (y/n): " verify_choice
        if [ "$verify_choice" != "y" ] && [ "$verify_choice" != "Y" ]; then
          rm -f "$test_file"
          return 1
        fi
      fi
    fi
    rm -f "$test_file"
  else
    echo "  Warning: Could not verify audio capture (test recording failed)."
    echo "  Recording will proceed but may not capture audio."
  fi

  local timestamp
  timestamp="$(date +%Y-%m-%d_%H-%M-%S)"
  local output_file="$RECORDINGS_DIR/${timestamp}.mp4"

  echo "Starting recording..."
  echo "  Screen device: [$SCREEN_DEVICE_INDEX]"
  echo "  Audio device:  [$AUDIO_DEVICE_INDEX] ${AUDIO_DEVICE:-}"
  echo "  Output: $output_file"

  ffmpeg -y \
    -f avfoundation \
    -framerate 30 \
    -i "${SCREEN_DEVICE_INDEX}:${AUDIO_DEVICE_INDEX}" \
    -c:v libx264 -preset ultrafast -crf 23 \
    -c:a aac -b:a 128k \
    "$output_file" \
    </dev/null >/dev/null 2>&1 &

  local ffmpeg_pid=$!
  echo "$ffmpeg_pid" > "$PID_FILE"
  echo "$output_file" > "$CURRENT_FILE"

  sleep 1
  if kill -0 "$ffmpeg_pid" 2>/dev/null; then
    echo "  Recording started (PID: $ffmpeg_pid)."
    echo ""
    echo "  Run './test-record.sh stop' when done."
  else
    echo "  Error: ffmpeg failed to start. Check your device indices."
    echo "  Run './test-record.sh setup' to reconfigure."
    rm -f "$PID_FILE" "$CURRENT_FILE"
    return 1
  fi
}

# ── Stop command ───────────────────────────────────────────────────

cmd_stop() {
  load_config

  if [ ! -f "$PID_FILE" ]; then
    echo "No recording in progress."
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  local recording_file=""
  if [ -f "$CURRENT_FILE" ]; then
    recording_file="$(cat "$CURRENT_FILE")"
  fi

  echo "Stopping recording (PID: $pid)..."
  if kill -0 "$pid" 2>/dev/null; then
    kill -INT "$pid" 2>/dev/null || true
    local waited=0
    while kill -0 "$pid" 2>/dev/null && [ $waited -lt 10 ]; do
      sleep 1
      waited=$((waited + 1))
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  rm -f "$PID_FILE" "$CURRENT_FILE"
  echo "  Recording stopped."

  if [ -n "$recording_file" ] && [ -f "$recording_file" ]; then
    echo ""
    echo "Recording saved: $recording_file"

    local file_size
    file_size="$(du -h "$recording_file" | cut -f1)"
    echo "  Size: $file_size"

    if [ -n "$WHISPER_PATH" ] && [ -x "$WHISPER_PATH" ] 2>/dev/null || command -v "$WHISPER_PATH" &>/dev/null 2>&1; then
      echo ""
      cmd_analyze "$recording_file"
    else
      echo ""
      echo "Whisper not configured. To transcribe later:"
      echo "  ./test-record.sh analyze $recording_file"
    fi
  else
    echo "  Warning: Recording file not found."
  fi
}

# ── Analyze command ────────────────────────────────────────────────

cmd_analyze() {
  load_config

  local input_file="${1:-}"
  if [ -z "$input_file" ]; then
    local latest
    latest="$(ls -t "$RECORDINGS_DIR"/*.mp4 2>/dev/null | head -1)"
    if [ -z "$latest" ]; then
      echo "No recording files found in $RECORDINGS_DIR"
      echo "Usage: ./test-record.sh analyze [file.mp4]"
      return 1
    fi
    input_file="$latest"
    echo "Using most recent recording: $input_file"
  fi

  if [ ! -f "$input_file" ]; then
    echo "File not found: $input_file"
    return 1
  fi

  if [ -z "$WHISPER_PATH" ]; then
    echo "Whisper not configured. Run: ./test-record.sh setup"
    return 1
  fi

  local base_name
  base_name="$(basename "$input_file" .mp4)"
  local wav_file="$RECORDINGS_DIR/${base_name}.wav"
  local json_file="$RECORDINGS_DIR/${base_name}.json"

  # Extract audio
  echo "Extracting audio..."
  ffmpeg -y -i "$input_file" -vn -acodec pcm_s16le -ar 16000 -ac 1 "$wav_file" 2>/dev/null
  echo "  Audio extracted: $wav_file"

  # Run Whisper
  echo "Running Whisper (model: ${WHISPER_MODEL:-medium})..."
  echo "  This may take a while depending on recording length and model size."

  "$WHISPER_PATH" \
    "$wav_file" \
    --model "${WHISPER_MODEL:-medium}" \
    --output_format json \
    --word_timestamps True \
    --language en \
    --no_speech_threshold 0.5 \
    --output_dir "$RECORDINGS_DIR" \
    2>/dev/null

  if [ -f "$json_file" ]; then
    echo "  Transcript saved: $json_file"
    echo ""
    cmd_report "$json_file"
  elif [ -f "$RECORDINGS_DIR/${base_name}.wav.json" ]; then
    mv "$RECORDINGS_DIR/${base_name}.wav.json" "$json_file"
    echo "  Transcript saved: $json_file"
    echo ""
    cmd_report "$json_file"
  else
    echo "  Warning: Whisper did not produce a JSON file."
    echo "  Check that the recording contains audible speech."
  fi
}

# ── Report command ─────────────────────────────────────────────────

cmd_report() {
  local json_file="${1:-}"
  if [ -z "$json_file" ]; then
    local latest
    latest="$(ls -t "$RECORDINGS_DIR"/*.json 2>/dev/null | head -1)"
    if [ -z "$latest" ]; then
      echo "No transcript files found in $RECORDINGS_DIR"
      echo "Usage: ./test-record.sh report [file.json]"
      return 1
    fi
    json_file="$latest"
    echo "Using most recent transcript: $json_file"
  fi

  if [ ! -f "$json_file" ]; then
    echo "File not found: $json_file"
    return 1
  fi

  local base_name
  base_name="$(basename "$json_file" .json)"
  local report_file="$RECORDINGS_DIR/${base_name}-latency-report.txt"

  # Parse JSON and generate report using Python (available on macOS)
  python3 -c "
import json, sys

with open('$json_file') as f:
    data = json.load(f)

raw_segments = data.get('segments', [])
if not raw_segments:
    print('No speech segments found in transcript.')
    sys.exit(0)

# Filter out Whisper hallucinations: segments where the model is
# confident there is no speech, or single-word low-confidence ghosts.
segments = []
filtered = 0
for seg in raw_segments:
    no_speech = seg.get('no_speech_prob', 0)
    avg_logprob = seg.get('avg_logprob', 0)
    text = seg.get('text', '').strip()
    word_count = len(text.split())

    # High no_speech_prob means Whisper itself thinks this is silence
    if no_speech > 0.6:
        filtered += 1
        continue

    # Single word with poor confidence is almost always a hallucination
    if word_count <= 1 and avg_logprob < -0.5:
        filtered += 1
        continue

    segments.append(seg)

lines = []
lines.append('claude-a11y Latency Report')
lines.append('Recording: ${base_name}')
lines.append('')

if not segments:
    lines.append('No real speech detected.')
    lines.append(f'({len(raw_segments)} segments were filtered as Whisper hallucinations)')
    lines.append('')
    lines.append('This usually means the audio loopback did not capture system audio.')
    lines.append('Check your audio device setup (BoomAudio, BlackHole, etc).')
    report = '\n'.join(lines)
    print(report)
    with open('$report_file', 'w') as f:
        f.write(report + '\n')
    sys.exit(0)

total_duration = segments[-1].get('end', 0)
lines.append(f'Duration: {total_duration:.1f}s')
lines.append(f'Segments: {len(segments)} (filtered {filtered} hallucinations)')
lines.append('')

header = f'{\"Seg\":<5} {\"Start\":>8} {\"End\":>8} {\"Gap\":>8}  Text'
lines.append(header)
lines.append('-' * len(header) + '-' * 40)

gaps = []
prev_end = None
total_speech = 0.0

for i, seg in enumerate(segments):
    start = seg.get('start', 0)
    end = seg.get('end', 0)
    text = seg.get('text', '').strip()
    duration = end - start
    total_speech += duration

    gap_str = '--'
    if prev_end is not None:
        gap = start - prev_end
        if gap > 0.05:
            gaps.append(gap)
            gap_str = f'{gap:.2f}s'

    lines.append(f'{i+1:<5} {start:>7.2f}s {end:>7.2f}s {gap_str:>8}  \"{text}\"')
    prev_end = end

lines.append('')
lines.append('Summary:')
lines.append(f'  Announcements: {len(segments)}')

if gaps:
    avg_gap = sum(gaps) / len(gaps)
    min_gap = min(gaps)
    max_gap = max(gaps)
    lines.append(f'  Avg gap between announcements: {avg_gap:.2f}s')
    lines.append(f'  Min gap: {min_gap:.2f}s')
    lines.append(f'  Max gap: {max_gap:.2f}s')
else:
    lines.append(f'  No gaps detected (single segment or continuous speech)')

total_silence = total_duration - total_speech
lines.append(f'  Total speech time: {total_speech:.1f}s')
lines.append(f'  Total silence: {max(0, total_silence):.1f}s')

report = '\n'.join(lines)
print(report)

with open('$report_file', 'w') as f:
    f.write(report + '\n')
" 2>/dev/null

  if [ -f "$report_file" ]; then
    echo ""
    echo "Report saved: $report_file"
  fi
}

# ── Status command ─────────────────────────────────────────────────

cmd_status() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "Recording is active (PID: $pid)."
      if [ -f "$CURRENT_FILE" ]; then
        echo "  Output: $(cat "$CURRENT_FILE")"
      fi
    else
      echo "Stale PID file found. No recording in progress."
      rm -f "$PID_FILE" "$CURRENT_FILE"
    fi
  else
    echo "No recording in progress."
  fi

  local count=0
  for f in "$RECORDINGS_DIR"/*.mp4; do
    [ -f "$f" ] && count=$((count + 1))
  done
  echo "Recordings in $RECORDINGS_DIR: $count"
}

# ── Entry point ────────────────────────────────────────────────────

case "${1:-}" in
  setup)   cmd_setup ;;
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  analyze) cmd_analyze "${2:-}" ;;
  report)  cmd_report "${2:-}" ;;
  status)  cmd_status ;;
  *)
    echo "test-record.sh — Screen + audio recording with Whisper analysis"
    echo ""
    echo "Usage:"
    echo "  ./test-record.sh setup              Interactive first-time config"
    echo "  ./test-record.sh start              Begin recording"
    echo "  ./test-record.sh stop               Stop recording, transcribe, report"
    echo "  ./test-record.sh analyze [file.mp4] Transcribe an existing recording"
    echo "  ./test-record.sh report [file.json] Regenerate latency report"
    echo "  ./test-record.sh status             Check recording status"
    echo ""
    echo "Config: $CONFIG_FILE"
    echo "Recordings: $RECORDINGS_DIR"
    ;;
esac
