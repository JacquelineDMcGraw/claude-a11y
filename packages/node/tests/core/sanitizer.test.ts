import { describe, it, expect } from "vitest";
import { sanitize, createChunkSanitizer } from "../../src/core/sanitizer.js";

describe("sanitize()", () => {
  // === Basic SGR (color) stripping ===

  it("strips basic SGR color codes", () => {
    expect(sanitize("\x1B[31mred text\x1B[0m")).toBe("red text\n");
  });

  it("strips compound SGR sequences", () => {
    expect(sanitize("\x1B[1;32;48;5;16mbold green\x1B[0m")).toBe("bold green\n");
  });

  it("strips bold/dim/italic via SGR", () => {
    expect(sanitize("\x1B[1m## Heading\x1B[22m\n\x1B[2msome dimmed text\x1B[22m")).toBe(
      "## Heading\nsome dimmed text\n"
    );
  });

  it("strips 256-color sequences", () => {
    expect(sanitize("\x1B[38;5;208morange text\x1B[0m")).toBe("orange text\n");
  });

  it("strips true-color (24-bit) sequences", () => {
    expect(sanitize("\x1B[38;2;255;165;0mtrue color orange\x1B[0m")).toBe(
      "true color orange\n"
    );
  });

  it("strips compound true-color bold", () => {
    expect(sanitize("\x1B[1;38;2;255;100;0mTrue color bold\x1B[0m")).toBe(
      "True color bold\n"
    );
  });

  // === Cursor movement ===

  it("strips cursor up/down movement", () => {
    expect(sanitize("\x1B[2Amove up\x1B[3Bmove down")).toBe("move upmove down\n");
  });

  it("strips cursor right/left movement", () => {
    expect(sanitize("\x1B[10Cmove right\x1B[5Dmove left")).toBe(
      "move rightmove left\n"
    );
  });

  it("strips cursor position and absolute movement", () => {
    expect(sanitize("\x1B[1G\x1B[2Kline content")).toBe("line content\n");
  });

  // === Erase sequences ===

  it("strips screen clear sequences", () => {
    expect(sanitize("\x1B[2J\x1B[Hclear screen")).toBe("clear screen\n");
  });

  it("strips erase-to-end-of-line", () => {
    expect(sanitize("\x1B[Kend of line")).toBe("end of line\n");
  });

  // === OSC sequences ===

  it("strips terminal title OSC", () => {
    expect(sanitize("\x1B]0;My Title\x07text after")).toBe("text after\n");
  });

  it("strips hyperlink OSC sequences", () => {
    expect(sanitize("\x1B]8;;https://example.com\x07link\x1B]8;;\x07")).toBe(
      "link\n"
    );
  });

  it("strips window title setting", () => {
    expect(sanitize("\x1B]0;Claude Code - Working\x07actual output")).toBe(
      "actual output\n"
    );
  });

  // === Orphan carriage returns ===

  it("strips orphan CR (spinner artifacts)", () => {
    expect(
      sanitize("Thinking... |\rThinking... /\rThinking... —\rDone!")
    ).toBe("Done!\n");
  });

  it("preserves \\r\\n line endings", () => {
    expect(sanitize("line1\r\nline2")).toBe("line1\r\nline2\n");
  });

  // === Backspace overwrite ===

  it("strips backspace overwrite sequences", () => {
    expect(sanitize("abc\x08\x08\x08xyz")).toBe("xyz\n");
  });

  it("handles nested backspace overwrites", () => {
    // ab\x08 removes b→a, then c→ac, \x08 removes c→a, then d→ad
    expect(sanitize("ab\x08c\x08d")).toBe("ad\n");
  });

  // === Show/hide cursor ===

  it("strips show/hide cursor sequences", () => {
    expect(sanitize("\x1B[?25lhidden cursor\x1B[?25h")).toBe("hidden cursor\n");
  });

  it("strips auto-wrap mode sequences", () => {
    expect(sanitize("\x1B[?7hwrapped text\x1B[?7l")).toBe("wrapped text\n");
  });

  // === Multiple blank lines ===

  it("collapses multiple blank lines into one", () => {
    expect(sanitize("line1\n\n\n\n\nline2")).toBe("line1\n\nline2\n");
  });

  it("preserves double blank lines", () => {
    expect(sanitize("line1\n\nline2")).toBe("line1\n\nline2\n");
  });

  // === Trailing whitespace ===

  it("trims trailing whitespace per line", () => {
    expect(sanitize("hello   \nworld  \n")).toBe("hello\nworld\n");
  });

  // === Multi-byte / emoji ===

  it("preserves emoji with ANSI stripped", () => {
    expect(sanitize("\x1B[32m\u{1F389} Success!\x1B[0m")).toBe(
      "\u{1F389} Success!\n"
    );
  });

  it("preserves zero-width joiners in emoji", () => {
    const family = "family: \u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466} emoji";
    expect(sanitize(family)).toBe(family + "\n");
  });

  it("strips ANSI around mixed emoji and text", () => {
    expect(
      sanitize("\x1B[32m\u2705 Success\x1B[0m \u2014 \x1B[31m\u274C Failure\x1B[0m")
    ).toBe("\u2705 Success \u2014 \u274C Failure\n");
  });

  // === Braille spinner characters ===

  it("preserves braille chars but strips cursor repositioning", () => {
    const input =
      "\u280B Working...\x1B[1G\x1B[2K\u2819 Working...\x1B[1G\x1B[2K\u2839 Working...";
    const result = sanitize(input);
    // Braille chars are valid Unicode and should remain
    expect(result).toContain("Working...");
    // But cursor movement should be gone
    expect(result).not.toContain("\x1B");
  });

  // === Cursor save/restore ===

  it("strips cursor save/restore sequences", () => {
    expect(sanitize("\x1B[s saving cursor \x1B[u restoring cursor")).toBe(
      " saving cursor  restoring cursor\n"
    );
  });

  // === Alternate screen buffer ===

  it("strips alternate screen buffer sequences", () => {
    expect(sanitize("\x1B[?1049h alt screen content \x1B[?1049l")).toBe(
      " alt screen content\n"
    );
  });

  // === Kitty/iTerm2 image protocol ===

  it("strips Kitty image protocol sequences without crashing", () => {
    // Fully stripped input becomes empty string
    expect(sanitize("\x1B_Gf=100,s=1,v=1,a=T;base64data\x1B\\")).toBe("");
  });

  // === Lone ESC ===

  it("strips lone ESC not followed by a sequence", () => {
    expect(sanitize("raw escape \x1B without bracket")).toBe(
      "raw escape  without bracket\n"
    );
  });

  // === 8-bit C1 control codes ===

  it("strips 8-bit CSI (0x9B)", () => {
    expect(sanitize("\x9B31mred text\x9B0m")).toBe("red text\n");
  });

  // === BEL character ===

  it("strips standalone BEL character", () => {
    expect(sanitize("text\x07more text")).toBe("textmore text\n");
  });

  // === Edge cases ===

  it("returns empty string for empty input", () => {
    expect(sanitize("")).toBe("");
  });

  it("passes through plain text unchanged (plus trailing newline)", () => {
    expect(sanitize("plain text\nwith lines\n")).toBe(
      "plain text\nwith lines\n"
    );
  });

  it("handles input that is only ANSI codes", () => {
    // Fully stripped input becomes empty string
    expect(sanitize("\x1B[31m\x1B[0m")).toBe("");
  });

  it("ensures trailing newline", () => {
    expect(sanitize("no trailing newline")).toBe("no trailing newline\n");
  });

  it("preserves existing trailing newline without doubling", () => {
    expect(sanitize("has newline\n")).toBe("has newline\n");
  });

  // === Real-world Claude patterns ===

  it("handles DCS sequences", () => {
    expect(sanitize("\x1BP+q\x1B\\text after")).toBe("text after\n");
  });

  it("handles ESC single-letter sequences", () => {
    expect(sanitize("\x1BMreverse index\x1BDindex")).toBe(
      "reverse indexindex\n"
    );
  });
});


describe("createChunkSanitizer()", () => {
  it("handles simple chunks without splits", () => {
    const s = createChunkSanitizer();
    expect(s.push("hello ")).toBe("hello ");
    expect(s.push("world")).toBe("world");
    expect(s.flush()).toBe("");
  });

  it("handles ESC split at chunk boundary", () => {
    const s = createChunkSanitizer();
    const out1 = s.push("hello \x1B");
    expect(out1).toBe("hello ");

    const out2 = s.push("[31mworld\x1B[0m");
    expect(out2).toBe("world");

    expect(s.flush()).toBe("");
  });

  it("handles CSI parameter split across chunks", () => {
    const s = createChunkSanitizer();
    const out1 = s.push("text\x1B[38;5");
    expect(out1).toBe("text");

    const out2 = s.push(";208mcolored\x1B[0m");
    expect(out2).toBe("colored");

    expect(s.flush()).toBe("");
  });

  it("handles OSC split across 3 chunks", () => {
    const s = createChunkSanitizer();
    const out1 = s.push("before\x1B]8;");
    expect(out1).toBe("before");

    const out2 = s.push(";https://ex");
    expect(out2).toBe("");

    const out3 = s.push("ample.com\x07link\x1B]8;;\x07after");
    expect(out3).toBe("linkafter");

    expect(s.flush()).toBe("");
  });

  it("flushes remaining buffer when stream ends", () => {
    const s = createChunkSanitizer();
    const out1 = s.push("trailing \x1B");
    expect(out1).toBe("trailing ");

    // Flush should strip the lone ESC
    const flushed = s.flush();
    expect(flushed).toBe("");
  });

  it("handles lone ESC followed by text in next chunk", () => {
    const s = createChunkSanitizer();
    s.push("a\x1B");
    const out2 = s.push("b"); // ESC followed by 'b' is not a standard sequence
    // The ESC should be stripped and 'b' should come through
    // ESC + b: \x1B is lone, 'b' is text
    // Actually \x1Bb would match ESC_SINGLE_RE since b is a-z
    expect(out2).not.toContain("\x1B");
  });

  it("strips ANSI from each chunk independently", () => {
    const s = createChunkSanitizer();
    expect(s.push("\x1B[31mred\x1B[0m")).toBe("red");
    expect(s.push(" and \x1B[32mgreen\x1B[0m")).toBe(" and green");
    expect(s.flush()).toBe("");
  });

  it("handles orphan CR in chunks", () => {
    const s = createChunkSanitizer();
    expect(s.push("spinner\roverwrite")).toBe("overwrite");
    expect(s.flush()).toBe("");
  });

  it("handles empty chunks", () => {
    const s = createChunkSanitizer();
    expect(s.push("")).toBe("");
    expect(s.push("text")).toBe("text");
    expect(s.flush()).toBe("");
  });

  it("preserves \\r\\n in chunks", () => {
    const s = createChunkSanitizer();
    expect(s.push("line1\r\nline2")).toBe("line1\r\nline2");
    expect(s.flush()).toBe("");
  });

  it("handles large chunks without issues", () => {
    const s = createChunkSanitizer();
    const chunk = "\x1B[32mword\x1B[0m ".repeat(10000);
    const result = s.push(chunk);
    expect(result).not.toContain("\x1B");
    expect(result).toContain("word");
    expect(s.flush()).toBe("");
  });
});
