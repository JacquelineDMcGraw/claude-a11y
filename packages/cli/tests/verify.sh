#!/bin/bash
# Standalone verification script — byte-level proof of clean output
# Can be run without Node test framework
# Usage: bash tests/verify.sh

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/bin/claude-sr.js"
MOCK="$ROOT/tests/fixtures/mock-claude.sh"
MOCK_ANSI="$ROOT/tests/fixtures/mock-claude-ansi-heavy.sh"
FAILURES=0

echo "=== claude-accessible output verification ==="
echo ""

# Use Node for reliable byte-level scanning (no hex grep false positives)
SCAN_SCRIPT='
const fs = require("fs");
const buf = fs.readFileSync("/dev/stdin");
const forbidden = { ESC: 0x1b, CSI: 0x9b, BS: 0x08, BEL: 0x07 };
const counts = {};
for (const [name, byte] of Object.entries(forbidden)) counts[name] = 0;
let orphanCR = 0;
for (let i = 0; i < buf.length; i++) {
  for (const [name, byte] of Object.entries(forbidden)) {
    if (buf[i] === byte) counts[name]++;
  }
  if (buf[i] === 0x0d && (i + 1 >= buf.length || buf[i + 1] !== 0x0a)) orphanCR++;
}
counts.orphanCR = orphanCR;
console.log(JSON.stringify(counts));
'

check_output() {
  local label="$1"
  local mock="$2"

  echo "--- $label ---"
  local OUTPUT
  OUTPUT=$(CLAUDE_PATH="$mock" node "$BIN" -p "test" 2>/dev/null)

  local SCAN
  SCAN=$(echo -n "$OUTPUT" | node -e "$SCAN_SCRIPT")

  local ESC=$(echo "$SCAN" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).ESC))")
  local CSI=$(echo "$SCAN" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).CSI))")
  local BS=$(echo "$SCAN" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).BS))")
  local BEL=$(echo "$SCAN" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).BEL))")
  local CR=$(echo "$SCAN" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).orphanCR))")

  local PASSED=true

  echo -n "  ESC (0x1b): "
  if [ "$ESC" = "0" ]; then echo "PASS"; else echo "FAIL ($ESC found)"; PASSED=false; fi

  echo -n "  CSI (0x9b): "
  if [ "$CSI" = "0" ]; then echo "PASS"; else echo "FAIL ($CSI found)"; PASSED=false; fi

  echo -n "  BS  (0x08): "
  if [ "$BS" = "0" ]; then echo "PASS"; else echo "FAIL ($BS found)"; PASSED=false; fi

  echo -n "  BEL (0x07): "
  if [ "$BEL" = "0" ]; then echo "PASS"; else echo "FAIL ($BEL found)"; PASSED=false; fi

  echo -n "  Orphan CR:  "
  if [ "$CR" = "0" ]; then echo "PASS"; else echo "FAIL ($CR found)"; PASSED=false; fi

  if [ "$PASSED" = "false" ]; then
    FAILURES=$((FAILURES + 1))
    echo "  Output sample:"
    echo "$OUTPUT" | cat -v | head -5
  fi
  echo ""
}

check_output "Basic mock" "$MOCK"
check_output "ANSI-heavy mock" "$MOCK_ANSI"

# Visual check
echo "--- cat -v check (basic mock) ---"
CATV_OUTPUT=$(CLAUDE_PATH="$MOCK" node "$BIN" -p "test" 2>/dev/null)
CATV_COUNT=$(echo -n "$CATV_OUTPUT" | cat -v | grep -c '\^\[' || true)
echo -n "  Escaped sequences visible: "
if [ "$CATV_COUNT" = "0" ]; then
  echo "PASS (none)"
else
  echo "WARNING ($CATV_COUNT found)"
fi
echo ""

if [ "$FAILURES" -eq 0 ]; then
  echo "=== All checks passed ==="
  exit 0
else
  echo "=== $FAILURES mock(s) had forbidden bytes ==="
  exit 1
fi
