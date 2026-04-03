# VoiceOver Validation Results

Date: 2026-04-03
Platform: Darwin arm64
Capture method: system-app
Whisper model: tiny
TTS engine: macOS `say`

## TTS Results

| Fixture | Expected | Transcript | Latency | Pass |
|---------|----------|------------|---------|------|
| bash-success | Ran |  | N/A | PASS |
| bash-failure | Ran | Rancat non-existent, exit code 1. | 1960ms | PASS |
| edit | Edited | Edit Index T.S. Replace one line with two lines. | 1839ms | PASS |
| read | Read |  | N/A | PASS |
| write | file | Rote new file TS2 lines defines the NB. | 1700ms | PASS |
| glob | TypeScript |  | N/A | PASS |
| grep | match |  | N/A | PASS |
| task | Launched | Launched Explore Agent, Status, completed. | 1799ms | PASS |
| web-search | search | Search for Vietest Coverage Setup. | 1700ms | PASS |
| web-fetch | Fetched | FetchedExample.com, slash Happy Ducks. | 2000ms | FAIL |

## Earcon Results

| Sound | Earcon ID | Volume | Audible |
|-------|-----------|--------|---------|
| Tink.aiff | edit-complete | -42.9dB | Yes |
| Glass.aiff | test-pass | -42.1dB | Yes |
| Basso.aiff | test-fail | -44.9dB | Yes |

## Summary

- Total: 10
- Passed: 9
- Failed: 1
- Average latency: 1833ms
- Max latency: 2000ms
