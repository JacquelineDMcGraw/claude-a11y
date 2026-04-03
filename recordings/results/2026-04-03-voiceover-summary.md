# VoiceOver Validation Results

Date: 2026-04-03
Platform: Darwin arm64
Capture method: system-app
Whisper model: medium
TTS engine: macOS `say`

## TTS Results

| Fixture | Expected | Transcript | Latency | Pass |
|---------|----------|------------|---------|------|
| bash-success | Ran |  | N/A | PASS |
| bash-failure | Ran | Rancat nonexistent. Exit code 1. | 2000ms | PASS |
| edit | Edited | Edited index TS, replaced one line with two lines. | 1860ms | PASS |
| read | Read |  | N/A | PASS |
| write | file | Rotnewfile.ts, two lines, defines NB. | 2260ms | PASS |
| glob | TypeScript |  | N/A | PASS |
| grep | match |  | N/A | PASS |
| task | Launched | Launched explore agent status completed. | 0ms | PASS |
| web-search | search | Search for Vitast Coverage Setup | 1660ms | PASS |
| web-fetch | Fetched |  | N/A | PASS |

## Earcon Results

| Sound | Earcon ID | Volume | Audible |
|-------|-----------|--------|---------|
| Tink.aiff | edit-complete | -42.8dB | Yes |
| Glass.aiff | test-pass | -42.1dB | Yes |
| Basso.aiff | test-fail | -44.8dB | Yes |

## Summary

- Total: 10
- Passed: 10
- Failed: 0
- Average latency: 1945ms
- Max latency: 2260ms
