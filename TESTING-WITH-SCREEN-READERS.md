# Testing claude-accessible with Screen Readers

## Prerequisites
- claude-accessible installed (`npm install -g claude-accessible`)
- Claude Code installed and authenticated
- A screen reader (see platform-specific setup below)

## Test Matrix

| # | Test Case | Expected Behavior | Pass Criteria |
|---|-----------|-------------------|---------------|
| 1 | Launch REPL | SR announces "Claude Code (Screen Reader Mode)" | Clear speech, no garbled chars |
| 2 | Type "hello" and press Enter | SR announces "Thinking..." then Claude's response | No freezing, no repeated characters |
| 3 | Multi-line response | SR reads each line in sequence | No skipped lines, no re-reading |
| 4 | Code in response | SR reads code without strange characters | No pipe chars, no braille dots from spinners |
| 5 | Tool use (file read) | SR announces "[Tool] Reading file: X" | Clear announcement before response |
| 6 | Tool use (bash command) | SR announces "[Tool] Running command: X" | Command is readable |
| 7 | Response completion | SR announces "[Done] (X turns, $Y cost)" | Clear end-of-response signal |
| 8 | Type /help | SR reads help text clearly | All commands readable |
| 9 | Type /exit | SR announces "Goodbye." | Clean exit, no crash |
| 10 | Long response (>50 lines) | SR reads continuously without freezing | No hangs or restarts needed |
| 11 | Error scenario | SR announces error message clearly | No ANSI artifacts |
| 12 | Ctrl+C during response | SR announces "[Cancelled]" | Stops cleanly, returns to prompt |

## Platform-Specific Setup

### Windows + NVDA (Primary target)
1. Install NVDA from nvaccess.org
2. Open Command Prompt or Windows Terminal
3. Run `claude-sr`
4. NVDA should begin reading output as it appears
5. Use `NVDA+Up Arrow` to re-read the last line if needed
6. Enable NVDA Speech Viewer (NVDA menu > Tools > Speech Viewer)
   to see text transcript of what NVDA speaks

### Windows + JAWS
1. JAWS should work similarly to NVDA
2. Use `JAWS Key + Up Arrow` to re-read
3. Note any differences from NVDA in the results

### macOS + VoiceOver
1. Enable VoiceOver: Cmd+F5 or System Settings > Accessibility > VoiceOver
2. Open Terminal.app
3. Run `claude-sr`
4. VO will automatically read new terminal output
5. Use `VO+A` to read from cursor position

### Linux + Orca
1. Ensure Orca is running (common on GNOME desktops)
2. Open a terminal emulator
3. Run `claude-sr`
4. Orca should read output as it appears

## Reporting Results

When reporting test results, please include:
- Screen reader name and version (e.g., "NVDA 2024.4.1")
- OS and version (e.g., "Windows 11 23H2")
- Terminal emulator (e.g., "Windows Terminal 1.19")
- For each test case: PASS, FAIL, or PARTIAL
- For failures: exact description of what the SR said/did wrong
- If possible: NVDA Speech Viewer log or audio recording

## Known Screen Reader Behaviors (Not Bugs)
- Screen readers may pronounce emoji differently — this is expected
- Code indentation may be read as "space space space" — this is normal
- Long URLs in output may be spelled out character by character — normal
- Screen readers may pause briefly between lines — this is normal buffering

## Automated Verification

Before manual testing, verify output is clean:

```bash
# Should show no ^[ characters (which indicate ESC bytes)
claude-sr "hello" 2>/dev/null | cat -v

# Run the byte-level verification suite
bash tests/verify.sh
```

If the automated checks pass but the screen reader still has issues,
please file a bug — it may be a pattern we haven't encountered yet.
