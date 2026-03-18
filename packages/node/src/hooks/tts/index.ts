import type { TtsConfig } from "../config/types.js";
import { speakMacos } from "./macos.js";
import { speakLinux } from "./linux.js";

/**
 * Sanitize text for safe TTS output.
 *
 * Strips:
 * - Null bytes (\x00)
 * - Control characters (\x01-\x08, \x0b, \x0c, \x0e-\x1f, \x7f)
 * - Emoji and pictographic characters (useless noise for screen readers)
 * - ANSI escape sequences (terminal color codes)
 * - Variation selectors and zero-width characters
 *
 * Preserves:
 * - Tab (\x09), newline (\x0a), carriage return (\x0d)
 * - Regular printable text
 *
 * Then truncates to maxLength.
 */
export function sanitize(text: string, maxLength: number): string {
  let clean = text;

  // Strip ANSI escape sequences (color codes, cursor movement, etc.)
  // eslint-disable-next-line no-control-regex
  clean = clean.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  // Also strip OSC sequences (\x1b]...\x07 or \x1b]...\x1b\\)
  // eslint-disable-next-line no-control-regex
  clean = clean.replace(/\x1b\].*?(?:\x07|\x1b\\)/g, "");

  // Strip control characters (keep \t \n \r)
  // eslint-disable-next-line no-control-regex
  clean = clean.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");

  // Strip emoji: emoticons, dingbats, symbols, pictographs, transport, flags, etc.
  // Uses Unicode property escapes for comprehensive emoji matching
  clean = clean.replace(/\p{Emoji_Presentation}/gu, "");
  clean = clean.replace(/\p{Extended_Pictographic}/gu, "");

  // Strip variation selectors (VS15 text, VS16 emoji) and zero-width chars
  clean = clean.replace(/[\uFE00-\uFE0F]/g, ""); // variation selectors
  clean = clean.replace(/[\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g, ""); // zero-width chars

  // Strip combining enclosing keycap (\u20E3) used in keycap emoji sequences
  clean = clean.replace(/\u20E3/g, "");

  // Strip regional indicator symbols (flag emoji components)
  clean = clean.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "");

  // Strip tag characters used in flag subdivisions
  clean = clean.replace(/[\u{E0020}-\u{E007F}]/gu, "");

  // Collapse multiple spaces left by stripped characters
  clean = clean.replace(/ {2,}/g, " ").trim();

  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength);
  }
  return clean;
}

/**
 * Speak text via platform TTS. Fire-and-forget.
 * Sanitizes input, truncates, and uses `--` flag terminator for safety.
 */
export function speak(text: string, config: TtsConfig): void {
  if (!config.enabled || !text) return;

  const clean = sanitize(text, config.maxLength);
  if (!clean) return;

  const engine = config.engine === "auto" ? detectPlatformEngine() : config.engine;

  try {
    if (engine === "say") {
      speakMacos(clean, config.rate);
    } else {
      speakLinux(clean, config.rate);
    }
  } catch {
    // TTS failure is never fatal
  }
}

function detectPlatformEngine(): "say" | "spd-say" {
  return process.platform === "darwin" ? "say" : "spd-say";
}
