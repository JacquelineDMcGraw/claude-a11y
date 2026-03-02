/**
 * ANSI escape code stripping and output sanitization.
 *
 * This is the most critical module in claude-accessible. Every byte
 * written to stdout passes through here. A single leaked escape code
 * causes screen readers to produce garbled output for blind users.
 */

// --- Regex patterns for ANSI / control sequence removal ---

// Combined ANSI/escape sequence pattern for single-pass removal.
// Ordered with longest/most specific patterns first.
// This single regex handles: OSC, DCS, APC, PM, SOS, CSI, ESC2, ESC-letter,
// 8-bit C1, lone ESC, and BEL — all in one pass.
const ANSI_ALL_RE = new RegExp(
  [
    // OSC: ESC ] ... (BEL | ESC \) — or 8-bit 0x9D
    "(?:\\x1B\\x5D|\\x9D)[^\\x07\\x1B]*(?:\\x07|\\x1B\\\\)",
    // DCS/APC/PM/SOS: ESC P/ESC _/ESC ^/ESC X ... ESC \ — or 8-bit equivalents
    "(?:\\x1B[P_X^]|[\\x90\\x98\\x9E\\x9F])[^\\x1B]*\\x1B\\\\",
    // CSI: ESC [ <params> <final> — or 8-bit 0x9B
    "(?:\\x1B\\x5B|\\x9B)[0-9;?]*[0-9A-Za-z@-~]",
    // 2-byte charset: ESC ( char, ESC ) char, ESC # char, etc.
    "\\x1B[()#*+\\-.\/][A-Z0-9]",
    // Single-letter ESC sequences
    "\\x1B[A-Za-z]",
    // 8-bit C1 control codes (0x80-0x9F)
    "[\\x80-\\x9F]",
    // Lone ESC (catch-all)
    "\\x1B",
    // BEL character
    "\\x07",
  ].join("|"),
  "g"
);


// Backspace overwrite sequences: a printable char followed by backspace
// Apply repeatedly until stable (nested overwrites)
const BACKSPACE_RE = /[^\x08\n]\x08/g;

// Orphan carriage return line-overwrite: text\roverwrite → overwrite
// Matches any content followed by \r (not \r\n), simulating terminal CR behavior
const CR_OVERWRITE_RE = /[^\n]*\r(?!\n)/g;

// Multiple consecutive blank lines → single blank line
const MULTI_BLANK_RE = /\n{3,}/g;

// Trailing whitespace per line
const TRAILING_WS_RE = /[ \t]+$/gm;


/**
 * Strip all ANSI escape codes and control sequences from a complete string.
 * Also cleans up formatting artifacts (orphan CR, backspaces, blank lines).
 */
export function sanitize(input: string): string {
  if (!input) return input;

  let s = input;

  // 1. Strip all ANSI/escape/control sequences in a single pass
  s = s.replace(ANSI_ALL_RE, "");

  // 7. Strip backspace overwrite sequences (apply until stable)
  let prev: string;
  do {
    prev = s;
    s = s.replace(BACKSPACE_RE, "");
  } while (s !== prev);
  // Remove any remaining lone backspaces
  s = s.replace(/\x08/g, "");

  // 8. Handle CR-based line overwriting (apply until stable for chained CRs)
  do {
    prev = s;
    s = s.replace(CR_OVERWRITE_RE, "");
  } while (s !== prev);

  // 9. Collapse multiple blank lines
  s = s.replace(MULTI_BLANK_RE, "\n\n");

  // 10. Trim trailing whitespace per line
  s = s.replace(TRAILING_WS_RE, "");

  // 11. Ensure trailing newline if there's any content
  if (s.length > 0 && !s.endsWith("\n")) {
    s += "\n";
  }

  return s;
}


/**
 * Streaming chunk sanitizer that handles escape sequences split across
 * chunk boundaries. Maintains a small buffer for partial sequences.
 */
export interface ChunkSanitizer {
  /** Process a chunk of input. Returns sanitized text ready to emit. */
  push(chunk: string): string;
  /** Flush any remaining buffered data. Call when stream ends. */
  flush(): string;
}

/**
 * Create a streaming chunk sanitizer.
 *
 * When processing streaming output, escape sequences may be split across
 * chunk boundaries (e.g., "\x1B" arrives in one chunk and "[31m" in the
 * next). This sanitizer buffers potential partial sequences and only emits
 * fully-sanitized text.
 */
export function createChunkSanitizer(): ChunkSanitizer {
  let buffer = "";

  return {
    push(chunk: string): string {
      // Prepend any buffered partial data from previous chunk
      const input = buffer + chunk;
      buffer = "";

      // Check if the input ends with what might be a partial escape sequence.
      // We look for a trailing ESC (0x1B) or 8-bit C1 code (0x9B) that
      // could be the start of an incomplete sequence.
      const trailingPartial = findTrailingPartial(input);

      if (trailingPartial > 0) {
        // Hold back the potential partial sequence
        buffer = input.slice(input.length - trailingPartial);
        const complete = input.slice(0, input.length - trailingPartial);
        return sanitizeChunkInner(complete);
      }

      return sanitizeChunkInner(input);
    },

    flush(): string {
      if (buffer.length === 0) return "";
      // Whatever is left in the buffer, sanitize it
      // (it was a partial sequence that never completed, so strip it)
      const result = sanitizeChunkInner(buffer);
      buffer = "";
      return result;
    },
  };
}


/**
 * Find the length of a trailing partial escape sequence at the end of input.
 * Returns 0 if the input doesn't end with a partial sequence.
 */
function findTrailingPartial(input: string): number {
  if (input.length === 0) return 0;

  // Scan backwards from the end to find the last ESC or C1 code
  for (let i = input.length - 1; i >= Math.max(0, input.length - 32); i--) {
    const code = input.charCodeAt(i);

    // ESC (0x1B) or CSI (0x9B)
    if (code === 0x1B || code === 0x9B) {
      const tail = input.slice(i);

      // Check if this looks like a complete sequence
      if (isCompleteSequence(tail)) {
        return 0; // It's complete, no buffering needed
      }

      // It's an incomplete sequence — buffer from here to end
      return input.length - i;
    }
  }

  return 0;
}


/**
 * Check if a string starting with ESC or C1 contains a complete sequence.
 */
function isCompleteSequence(s: string): boolean {
  if (s.length === 0) return true;

  const first = s.charCodeAt(0);

  // Lone ESC at end of string — definitely incomplete
  if ((first === 0x1B || first === 0x9B) && s.length === 1) return false;

  if (first === 0x1B) {
    if (s.length < 2) return false;

    const second = s.charCodeAt(1);

    // CSI: ESC [
    if (second === 0x5B) {
      // Need at least one final byte (0x40-0x7E)
      for (let i = 2; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0x40 && c <= 0x7E) return true; // Found final byte
        if (c < 0x20 || c > 0x3F) return false; // Invalid param byte
      }
      return false; // No final byte yet
    }

    // OSC: ESC ]
    if (second === 0x5D) {
      // Terminated by BEL or ESC backslash
      return s.includes("\x07") || s.includes("\x1B\\");
    }

    // DCS: ESC P, APC: ESC _, PM: ESC ^, SOS: ESC X
    if (second === 0x50 || second === 0x5F || second === 0x5E || second === 0x58) {
      return s.includes("\x1B\\");
    }

    // 2-byte charset sequences: ESC ( <char>, ESC ) <char>
    if (second === 0x28 || second === 0x29 || second === 0x23 ||
        second === 0x2A || second === 0x2B) {
      return s.length >= 3;
    }

    // Single-letter ESC sequences: ESC <letter>
    if ((second >= 0x41 && second <= 0x5A) || (second >= 0x61 && second <= 0x7A)) {
      return true;
    }

    // ESC followed by something we don't recognize — treat as complete
    // so it gets stripped rather than buffered forever
    return s.length >= 2;
  }

  // 8-bit CSI (0x9B)
  if (first === 0x9B) {
    for (let i = 1; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 0x40 && c <= 0x7E) return true;
      if (c < 0x20 || c > 0x3F) return false;
    }
    return false;
  }

  return true;
}


/**
 * Inner sanitization for streaming chunks. Similar to sanitize() but
 * doesn't do final formatting (trailing newlines, blank line collapsing)
 * since those should only be applied to the final assembled output.
 */
function sanitizeChunkInner(input: string): string {
  if (!input) return "";

  let s = input;

  // Strip all ANSI/escape/control sequences in a single pass
  s = s.replace(ANSI_ALL_RE, "");

  // Backspace overwrites
  let prev: string;
  do {
    prev = s;
    s = s.replace(BACKSPACE_RE, "");
  } while (s !== prev);
  s = s.replace(/\x08/g, "");

  // Handle CR-based line overwriting
  do {
    prev = s;
    s = s.replace(CR_OVERWRITE_RE, "");
  } while (s !== prev);

  return s;
}
