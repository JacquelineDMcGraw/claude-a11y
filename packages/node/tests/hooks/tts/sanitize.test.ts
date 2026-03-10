import { describe, it, expect } from "vitest";
import { sanitize } from "../../../src/hooks/tts/index.js";

const MAX = 500;

describe("sanitize", () => {
  // ─── Control Characters ───────────────────────────────────────────

  describe("control characters", () => {
    it("strips null byte \\x00", () => {
      expect(sanitize("hello\x00world", MAX)).toBe("helloworld");
    });

    it("strips SOH \\x01", () => {
      expect(sanitize("a\x01b", MAX)).toBe("ab");
    });

    it("strips STX \\x02", () => {
      expect(sanitize("a\x02b", MAX)).toBe("ab");
    });

    it("strips ETX \\x03", () => {
      expect(sanitize("a\x03b", MAX)).toBe("ab");
    });

    it("strips EOT \\x04", () => {
      expect(sanitize("a\x04b", MAX)).toBe("ab");
    });

    it("strips ENQ \\x05", () => {
      expect(sanitize("a\x05b", MAX)).toBe("ab");
    });

    it("strips ACK \\x06", () => {
      expect(sanitize("a\x06b", MAX)).toBe("ab");
    });

    it("strips BEL \\x07", () => {
      expect(sanitize("a\x07b", MAX)).toBe("ab");
    });

    it("strips BS \\x08", () => {
      expect(sanitize("a\x08b", MAX)).toBe("ab");
    });

    it("preserves TAB \\x09", () => {
      expect(sanitize("a\tb", MAX)).toBe("a\tb");
    });

    it("preserves LF \\x0a", () => {
      expect(sanitize("a\nb", MAX)).toBe("a\nb");
    });

    it("strips VT \\x0b", () => {
      expect(sanitize("a\x0bb", MAX)).toBe("ab");
    });

    it("strips FF \\x0c", () => {
      expect(sanitize("a\x0cb", MAX)).toBe("ab");
    });

    it("preserves CR \\x0d", () => {
      expect(sanitize("a\rb", MAX)).toBe("a\rb");
    });

    it("strips SO \\x0e", () => {
      expect(sanitize("a\x0eb", MAX)).toBe("ab");
    });

    it("strips SI \\x0f through US \\x1f", () => {
      let input = "start";
      for (let i = 0x0f; i <= 0x1f; i++) {
        input += String.fromCharCode(i);
      }
      input += "end";
      expect(sanitize(input, MAX)).toBe("startend");
    });

    it("strips DEL \\x7f", () => {
      expect(sanitize("a\x7fb", MAX)).toBe("ab");
    });

    it("strips all control chars in a mixed string", () => {
      expect(sanitize("he\x00ll\x07o \x1fwo\x7frld", MAX)).toBe("hello world");
    });
  });

  // ─── ANSI Escape Sequences ────────────────────────────────────────

  describe("ANSI escape sequences", () => {
    it("strips basic color codes", () => {
      expect(sanitize("\x1b[31mred text\x1b[0m", MAX)).toBe("red text");
    });

    it("strips bold/bright codes", () => {
      expect(sanitize("\x1b[1m\x1b[32mgreen bold\x1b[0m", MAX)).toBe("green bold");
    });

    it("strips 256-color codes", () => {
      expect(sanitize("\x1b[38;5;196mred\x1b[0m", MAX)).toBe("red");
    });

    it("strips RGB color codes", () => {
      expect(sanitize("\x1b[38;2;255;0;0mred\x1b[0m", MAX)).toBe("red");
    });

    it("strips cursor movement codes", () => {
      expect(sanitize("\x1b[2Amove up\x1b[3Bmove down", MAX)).toBe("move upmove down");
    });

    it("strips clear screen codes", () => {
      expect(sanitize("\x1b[2Jcleared", MAX)).toBe("cleared");
    });

    it("strips OSC sequences (title setting)", () => {
      expect(sanitize("\x1b]0;My Title\x07content", MAX)).toBe("content");
    });

    it("strips nested ANSI in realistic terminal output", () => {
      const input = "\x1b[1m\x1b[46m RUN \x1b[49m\x1b[22m \x1b[36mv4.0.18\x1b[39m tests passed";
      expect(sanitize(input, MAX)).toBe("RUN v4.0.18 tests passed");
    });
  });

  // ─── Emoji ────────────────────────────────────────────────────────

  describe("emoji stripping", () => {
    it("strips simple smiley emoji", () => {
      expect(sanitize("hello 😀 world", MAX)).toBe("hello world");
    });

    it("strips check mark emoji ✅", () => {
      expect(sanitize("✅ Tests passed", MAX)).toBe("Tests passed");
    });

    it("strips cross mark emoji ❌", () => {
      expect(sanitize("❌ Tests failed", MAX)).toBe("Tests failed");
    });

    it("strips warning emoji ⚠️", () => {
      const result = sanitize("⚠️ Warning", MAX);
      expect(result).toBe("Warning");
    });

    it("strips fire emoji 🔥", () => {
      expect(sanitize("🔥 hot take", MAX)).toBe("hot take");
    });

    it("strips rocket emoji 🚀", () => {
      expect(sanitize("🚀 deploying", MAX)).toBe("deploying");
    });

    it("strips sparkles emoji ✨", () => {
      expect(sanitize("✨ magic ✨", MAX)).toBe("magic");
    });

    it("strips thumbs up/down 👍👎", () => {
      expect(sanitize("👍 good 👎 bad", MAX)).toBe("good bad");
    });

    it("strips multiple different emoji in sequence", () => {
      expect(sanitize("🎉🎊🎈 party!", MAX)).toBe("party!");
    });

    it("strips heart emoji ❤️💙💚💛", () => {
      const result = sanitize("I ❤️💙💚💛 colors", MAX);
      expect(result).toBe("I colors");
    });

    it("strips arrow emoji ➡️⬅️⬆️⬇️", () => {
      const result = sanitize("go ➡️ here", MAX);
      expect(result).toBe("go here");
    });

    it("strips number/keycap emoji 1️⃣2️⃣3️⃣", () => {
      const result = sanitize("step 1️⃣ then 2️⃣", MAX);
      // After stripping emoji presentation + variation selectors + keycap
      expect(result).not.toContain("\uFE0F");
      expect(result).not.toContain("\u20E3");
    });

    it("strips flag emoji 🇺🇸🇬🇧", () => {
      expect(sanitize("🇺🇸 USA 🇬🇧 UK", MAX)).toBe("USA UK");
    });

    it("strips thinking face 🤔", () => {
      expect(sanitize("🤔 hmm", MAX)).toBe("hmm");
    });

    it("strips construction emoji 🚧", () => {
      expect(sanitize("🚧 under construction 🚧", MAX)).toBe("under construction");
    });

    it("strips clipboard emoji 📋", () => {
      expect(sanitize("📋 copied", MAX)).toBe("copied");
    });

    it("strips folder emoji 📁📂", () => {
      expect(sanitize("📁 src 📂 dist", MAX)).toBe("src dist");
    });

    it("strips common vitest/test output emoji", () => {
      // vitest uses ✓ (not emoji, just unicode) and ✗
      // But some tools use ✅ ❌ 🟢 🔴
      expect(sanitize("🟢 pass 🔴 fail", MAX)).toBe("pass fail");
    });

    it("preserves text-presentation symbols like checkmark ✓", () => {
      // U+2713 CHECK MARK is a regular text symbol, not emoji
      expect(sanitize("✓ passed", MAX)).toBe("✓ passed");
    });

    it("preserves regular unicode like accented characters", () => {
      expect(sanitize("café résumé naïve", MAX)).toBe("café résumé naïve");
    });

    it("preserves CJK characters", () => {
      expect(sanitize("日本語テスト", MAX)).toBe("日本語テスト");
    });

    it("preserves mathematical symbols", () => {
      expect(sanitize("a ≤ b × c ÷ d", MAX)).toBe("a ≤ b × c ÷ d");
    });
  });

  // ─── Zero-Width Characters ────────────────────────────────────────

  describe("zero-width and invisible characters", () => {
    it("strips zero-width space U+200B", () => {
      expect(sanitize("hello\u200Bworld", MAX)).toBe("helloworld");
    });

    it("strips zero-width non-joiner U+200C", () => {
      expect(sanitize("hello\u200Cworld", MAX)).toBe("helloworld");
    });

    it("strips zero-width joiner U+200D", () => {
      expect(sanitize("hello\u200Dworld", MAX)).toBe("helloworld");
    });

    it("strips left-to-right mark U+200E", () => {
      expect(sanitize("hello\u200Eworld", MAX)).toBe("helloworld");
    });

    it("strips right-to-left mark U+200F", () => {
      expect(sanitize("hello\u200Fworld", MAX)).toBe("helloworld");
    });

    it("strips byte order mark U+FEFF", () => {
      expect(sanitize("\uFEFFhello", MAX)).toBe("hello");
    });

    it("strips word joiner U+2060", () => {
      expect(sanitize("hello\u2060world", MAX)).toBe("helloworld");
    });

    it("strips line separator U+2028", () => {
      expect(sanitize("hello\u2028world", MAX)).toBe("helloworld");
    });

    it("strips paragraph separator U+2029", () => {
      expect(sanitize("hello\u2029world", MAX)).toBe("helloworld");
    });
  });

  // ─── Variation Selectors ──────────────────────────────────────────

  describe("variation selectors", () => {
    it("strips VS15 text presentation selector U+FE0E", () => {
      expect(sanitize("star\uFE0E", MAX)).toBe("star");
    });

    it("strips VS16 emoji presentation selector U+FE0F", () => {
      expect(sanitize("star\uFE0F", MAX)).toBe("star");
    });

    it("strips all variation selectors U+FE00-U+FE0F", () => {
      let input = "text";
      for (let i = 0xfe00; i <= 0xfe0f; i++) {
        input += String.fromCharCode(i);
      }
      input += "end";
      expect(sanitize(input, MAX)).toBe("textend");
    });
  });

  // ─── Truncation ───────────────────────────────────────────────────

  describe("truncation", () => {
    it("truncates text exceeding maxLength", () => {
      const result = sanitize("a".repeat(600), 500);
      expect(result.length).toBe(500);
    });

    it("does not truncate text within maxLength", () => {
      expect(sanitize("hello", 500)).toBe("hello");
    });

    it("truncates at exact boundary", () => {
      expect(sanitize("abcde", 3)).toBe("abc");
    });

    it("handles maxLength of 0", () => {
      expect(sanitize("hello", 0)).toBe("");
    });

    it("truncates after stripping (not before)", () => {
      // 3 emoji + 5 chars of text = emoji stripped first, then no truncation needed
      const result = sanitize("🔥🔥🔥hello", 500);
      expect(result).toBe("hello");
    });
  });

  // ─── Whitespace Collapse ──────────────────────────────────────────

  describe("whitespace collapse", () => {
    it("collapses double spaces left by stripping", () => {
      expect(sanitize("hello  world", MAX)).toBe("hello world");
    });

    it("collapses multiple spaces", () => {
      expect(sanitize("a     b", MAX)).toBe("a b");
    });

    it("trims leading/trailing whitespace", () => {
      expect(sanitize("  hello  ", MAX)).toBe("hello");
    });

    it("collapses spaces left by emoji removal", () => {
      expect(sanitize("✅  passed", MAX)).toBe("passed");
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty string", () => {
      expect(sanitize("", MAX)).toBe("");
    });

    it("handles string of only control characters", () => {
      expect(sanitize("\x00\x01\x02\x03", MAX)).toBe("");
    });

    it("handles string of only emoji", () => {
      expect(sanitize("🔥🚀✨💯", MAX)).toBe("");
    });

    it("handles string of only ANSI codes", () => {
      expect(sanitize("\x1b[31m\x1b[0m", MAX)).toBe("");
    });

    it("handles realistic vitest colored output", () => {
      const input = " \x1b[32m✓\x1b[39m tests/foo.test.ts \x1b[2m(5 tests)\x1b[22m\x1b[32m 3ms\x1b[39m";
      const result = sanitize(input, MAX);
      expect(result).toContain("tests/foo.test.ts");
      expect(result).toContain("5 tests");
      expect(result).not.toContain("\x1b");
    });

    it("handles mixed control chars + emoji + ANSI", () => {
      const input = "\x1b[1m🚀\x00 Deploy\x07 ✅ success\x1b[0m 🎉";
      const result = sanitize(input, MAX);
      expect(result).toBe("Deploy success");
    });
  });

  // ─── Argument Injection Prevention ────────────────────────────────

  describe("argument injection text (sanitize does not handle --, that's at speak level)", () => {
    it("preserves text that starts with dashes (not sanitize's job to add --)", () => {
      // sanitize just cleans the text; the `--` flag terminator is added by speak()
      expect(sanitize("--version", MAX)).toBe("--version");
    });

    it("preserves text with embedded flags", () => {
      expect(sanitize("ran --force flag", MAX)).toBe("ran --force flag");
    });
  });
});
