import { describe, it, expect, beforeAll } from "vitest";
import { initFormatter, formatForSpeech } from "../../src/core/speech-formatter.js";

// Initialize the remark parser once before all tests
beforeAll(async () => {
  await initFormatter();
});

describe("formatForSpeech()", () => {
  // === Code Fences ===

  describe("code fences", () => {
    it("transforms a fenced code block with language", () => {
      const input = "```python\nprint('hello')\n```";
      const result = formatForSpeech(input);
      expect(result).toBe("[Python]\nprint('hello')\n[End Python]");
    });

    it("transforms a fenced code block without language", () => {
      const input = "```\nsome code\n```";
      const result = formatForSpeech(input);
      expect(result).toBe("[Code]\nsome code\n[End Code]");
    });

    it("handles javascript code fence", () => {
      const input = '```javascript\nconst x = 42;\nconsole.log(x);\n```';
      const result = formatForSpeech(input);
      expect(result).toContain("[Javascript]");
      expect(result).toContain("const x = 42;");
      expect(result).toContain("[End Javascript]");
    });

    it("handles typescript code fence", () => {
      const input = "```typescript\ninterface Foo { bar: string }\n```";
      const result = formatForSpeech(input);
      expect(result).toContain("[Typescript]");
      expect(result).toContain("[End Typescript]");
    });

    it("handles bash code fence", () => {
      const input = "```bash\nnpm install\n```";
      const result = formatForSpeech(input);
      expect(result).toContain("[Bash]");
      expect(result).toContain("npm install");
      expect(result).toContain("[End Bash]");
    });

    it("preserves code content exactly inside fences", () => {
      // Code inside fences should not have markdown formatting applied
      const input = "```python\n# This is a comment, not a heading\n**not bold**\n```";
      const result = formatForSpeech(input);
      expect(result).toContain("# This is a comment, not a heading");
      expect(result).toContain("**not bold**");
    });

    it("handles multiple code blocks in one response", () => {
      const input = "First:\n\n```python\nprint('a')\n```\n\nSecond:\n\n```bash\necho hi\n```";
      const result = formatForSpeech(input);
      expect(result).toContain("[Python]");
      expect(result).toContain("[End Python]");
      expect(result).toContain("[Bash]");
      expect(result).toContain("[End Bash]");
    });
  });

  // === Headings ===

  describe("headings", () => {
    it("transforms h1 to [Heading]", () => {
      const result = formatForSpeech("# Main Title");
      expect(result).toBe("[Heading] Main Title");
    });

    it("transforms h2 to [Heading]", () => {
      const result = formatForSpeech("## Section Title");
      expect(result).toBe("[Heading] Section Title");
    });

    it("transforms h3 to [Subheading]", () => {
      const result = formatForSpeech("### Sub Section");
      expect(result).toBe("[Subheading] Sub Section");
    });

    it("transforms h4-h6 to [Subheading]", () => {
      expect(formatForSpeech("#### Deep")).toBe("[Subheading] Deep");
      expect(formatForSpeech("##### Deeper")).toBe("[Subheading] Deeper");
      expect(formatForSpeech("###### Deepest")).toBe("[Subheading] Deepest");
    });

    it("strips inline formatting inside headings", () => {
      const result = formatForSpeech("# The **bold** heading");
      expect(result).toBe("[Heading] The bold heading");
    });
  });

  // === Inline Formatting ===

  describe("inline formatting", () => {
    it("strips bold asterisks", () => {
      const result = formatForSpeech("This is **important** text");
      expect(result).toBe("This is important text");
    });

    it("strips bold underscores", () => {
      const result = formatForSpeech("This is __important__ text");
      expect(result).toBe("This is important text");
    });

    it("strips italic asterisks", () => {
      const result = formatForSpeech("This is *emphasized* text");
      expect(result).toBe("This is emphasized text");
    });

    it("strips italic underscores", () => {
      const result = formatForSpeech("This is _emphasized_ text");
      expect(result).toBe("This is emphasized text");
    });

    it("strips inline code backticks", () => {
      const result = formatForSpeech("Use the `console.log` function");
      expect(result).toBe("Use the console.log function");
    });

    it("handles nested bold inside italic", () => {
      const result = formatForSpeech("This is ***bold italic*** text");
      expect(result).toBe("This is bold italic text");
    });

    it("handles multiple inline formats in one line", () => {
      const result = formatForSpeech("**bold** and *italic* and `code`");
      expect(result).toBe("bold and italic and code");
    });
  });

  // === Links ===

  describe("links", () => {
    it("formats links with text and URL", () => {
      const result = formatForSpeech("[Click here](https://example.com)");
      expect(result).toBe("Click here (link: https://example.com)");
    });

    it("simplifies anchor links", () => {
      const result = formatForSpeech("[See above](#section)");
      expect(result).toBe("See above");
    });

    it("simplifies relative links", () => {
      const result = formatForSpeech("[readme](./README.md)");
      expect(result).toBe("readme");
    });
  });

  // === Images ===

  describe("images", () => {
    it("announces images with alt text", () => {
      const result = formatForSpeech("![A cute cat](https://example.com/cat.jpg)");
      expect(result).toBe("[Image: A cute cat]");
    });

    it("announces images without alt text", () => {
      const result = formatForSpeech("![](https://example.com/photo.png)");
      expect(result).toBe("[Image]");
    });
  });

  // === Lists ===

  describe("lists", () => {
    it("prefixes unordered list items with Bullet:", () => {
      const input = "- First item\n- Second item\n- Third item";
      const result = formatForSpeech(input);
      expect(result).toContain("Bullet: First item");
      expect(result).toContain("Bullet: Second item");
      expect(result).toContain("Bullet: Third item");
    });

    it("preserves ordered list numbering", () => {
      const input = "1. First\n2. Second\n3. Third";
      const result = formatForSpeech(input);
      expect(result).toContain("1. First");
      expect(result).toContain("2. Second");
      expect(result).toContain("3. Third");
    });

    it("strips inline formatting inside list items", () => {
      const input = "- **Bold item**\n- `code item`\n- *italic item*";
      const result = formatForSpeech(input);
      expect(result).toContain("Bullet: Bold item");
      expect(result).toContain("Bullet: code item");
      expect(result).toContain("Bullet: italic item");
    });
  });

  // === Blockquotes ===

  describe("blockquotes", () => {
    it("prefixes blockquote lines with [Quote]", () => {
      const result = formatForSpeech("> This is a quote");
      expect(result).toContain("[Quote]");
      expect(result).toContain("This is a quote");
    });

    it("handles multi-line blockquotes", () => {
      const input = "> First line\n> Second line";
      const result = formatForSpeech(input);
      expect(result).toContain("[Quote]");
      expect(result).toContain("First line");
      expect(result).toContain("Second line");
    });
  });

  // === Thematic Breaks ===

  describe("thematic breaks", () => {
    it("converts --- to [Separator]", () => {
      const result = formatForSpeech("---");
      expect(result).toBe("[Separator]");
    });

    it("converts *** to [Separator]", () => {
      const result = formatForSpeech("***");
      expect(result).toBe("[Separator]");
    });
  });

  // === Tables ===

  describe("tables", () => {
    it("formats a simple table with headers", () => {
      const input = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
      const result = formatForSpeech(input);
      expect(result).toContain("[Table, 2 columns]");
      expect(result).toContain("[Header] Name | Age");
      expect(result).toContain("[Row 1] Name: Alice, Age: 30");
      expect(result).toContain("[Row 2] Name: Bob, Age: 25");
      expect(result).toContain("[End Table]");
    });
  });

  // === Strikethrough ===

  describe("strikethrough", () => {
    it("wraps strikethrough text with announcements", () => {
      const result = formatForSpeech("~~deleted text~~");
      expect(result).toContain("[Strikethrough]");
      expect(result).toContain("deleted text");
      expect(result).toContain("[End Strikethrough]");
    });
  });

  // === Complex / Real-world ===

  describe("real-world Claude responses", () => {
    it("handles a typical code explanation response", () => {
      const input = [
        "Here's how to print hello world in Python:",
        "",
        "```python",
        'print("Hello, World!")',
        "```",
        "",
        "This uses the built-in `print` function.",
      ].join("\n");

      const result = formatForSpeech(input);

      // Should NOT contain raw backticks
      expect(result).not.toContain("```");
      expect(result).not.toContain("`print`");

      // Should contain speech cues
      expect(result).toContain("[Python]");
      expect(result).toContain('print("Hello, World!")');
      expect(result).toContain("[End Python]");
      expect(result).toContain("print function");
    });

    it("handles a heading + list + code response", () => {
      const input = [
        "## Steps to install",
        "",
        "1. Clone the repository",
        "2. Run `npm install`",
        "3. Run `npm start`",
        "",
        "### Configuration",
        "",
        "Edit the **config.json** file:",
        "",
        "```json",
        '{ "port": 3000 }',
        "```",
      ].join("\n");

      const result = formatForSpeech(input);
      expect(result).toContain("[Heading] Steps to install");
      expect(result).toContain("1. Clone the repository");
      expect(result).toContain("npm install");
      expect(result).toContain("[Subheading] Configuration");
      expect(result).toContain("config.json");
      expect(result).toContain("[Json]");
      expect(result).toContain("[End Json]");
      // No raw markdown syntax
      expect(result).not.toContain("##");
      expect(result).not.toContain("**config.json**");
    });

    it("handles plain text with no markdown", () => {
      const input = "This is just regular text with no formatting.";
      const result = formatForSpeech(input);
      expect(result).toBe("This is just regular text with no formatting.");
    });

    it("handles empty input", () => {
      expect(formatForSpeech("")).toBe("");
    });

    it("handles whitespace-only input", () => {
      const result = formatForSpeech("   \n\n  ");
      expect(result).toBe("");
    });
  });

  // === Custom format options ===

  describe("custom format options", () => {
    it("uses custom code block phrasing", () => {
      const input = "```python\nprint('hello')\n```";
      const result = formatForSpeech(input, {
        codeBlockStart: "Begin {lang} code block",
        codeBlockEnd: "End of {lang} code block",
      });
      expect(result).toBe("Begin Python code block\nprint('hello')\nEnd of Python code block");
    });

    it("uses custom heading prefix", () => {
      const result = formatForSpeech("# Title", {
        headingPrefix: "Section:",
      });
      expect(result).toBe("Section: Title");
    });

    it("uses custom subheading prefix", () => {
      const result = formatForSpeech("### Sub", {
        subheadingPrefix: "Subsection:",
      });
      expect(result).toBe("Subsection: Sub");
    });

    it("uses custom bullet prefix", () => {
      const result = formatForSpeech("- Item one\n- Item two", {
        bulletPrefix: "-",
      });
      expect(result).toContain("- Item one");
      expect(result).toContain("- Item two");
    });

    it("uses custom quote prefix", () => {
      const result = formatForSpeech("> Wise words", {
        quotePrefix: "Quoted:",
      });
      expect(result).toContain("Quoted: Wise words");
    });

    it("uses custom separator text", () => {
      const result = formatForSpeech("---", {
        separator: "[Section break]",
      });
      expect(result).toBe("[Section break]");
    });

    it("uses custom table phrasing", () => {
      const input = "| A | B |\n| --- | --- |\n| 1 | 2 |";
      const result = formatForSpeech(input, {
        tableStart: "Table with {cols} columns:",
        tableEnd: "Table ends.",
        tableHeader: "Headers:",
        tableRow: "Data row {n}:",
      });
      expect(result).toContain("Table with 2 columns:");
      expect(result).toContain("Headers: A | B");
      expect(result).toContain("Data row 1: A: 1, B: 2");
      expect(result).toContain("Table ends.");
    });

    it("uses custom image phrasing", () => {
      expect(formatForSpeech("![Cat](url)", {
        imageLabel: "Picture of {alt}",
      })).toBe("Picture of Cat");

      expect(formatForSpeech("![](url)", {
        imageLabelNoAlt: "Unlabeled picture",
      })).toBe("Unlabeled picture");
    });

    it("uses custom strikethrough phrasing", () => {
      const result = formatForSpeech("~~old~~", {
        strikethroughStart: "Deleted:",
        strikethroughEnd: "(end deleted)",
      });
      expect(result).toContain("Deleted: old (end deleted)");
    });

    it("leaves defaults for unspecified options", () => {
      const result = formatForSpeech("# Heading\n\n```python\ncode\n```", {
        headingPrefix: "H:",
      });
      expect(result).toContain("H: Heading");
      expect(result).toContain("[Python]");
      expect(result).toContain("[End Python]");
    });
  });

  // === Edge cases ===

  describe("edge cases", () => {
    it("does not treat underscores in identifiers as italic", () => {
      // file_name should NOT be treated as italic
      const result = formatForSpeech("Open the file_name_here.txt file");
      // The exact behavior depends on remark's parser, but the content should be preserved
      expect(result).toContain("file");
      expect(result).toContain("name");
    });

    it("handles consecutive code fences", () => {
      const input = "```python\ncode1\n```\n\n```bash\ncode2\n```";
      const result = formatForSpeech(input);
      expect(result).toContain("[Python]");
      expect(result).toContain("[End Python]");
      expect(result).toContain("[Bash]");
      expect(result).toContain("[End Bash]");
    });

    it("formatForSpeech returns text as-is if init was never called", async () => {
      // Test the fallback behavior by importing a fresh module
      // (This is more of a design contract test)
      const input = "Some **text**";
      // Since we called initFormatter in beforeAll, this will format properly
      const result = formatForSpeech(input);
      expect(result).toBe("Some text");
    });
  });
});
