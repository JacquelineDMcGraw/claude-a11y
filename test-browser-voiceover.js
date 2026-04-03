#!/usr/bin/env node

// Browser extension VoiceOver validation using virtual screen reader.
// Loads sr-validation.html in jsdom, injects chat-a11y.js, navigates
// with a virtual screen reader, and captures spoken phrases per test section.
//
// Runs entirely in-process -- no real browser, no VoiceOver, no focus stealing.
//
// Usage:
//   node test-browser-voiceover.js
//   node test-browser-voiceover.js --output /tmp/results.json

const { JSDOM } = require("jsdom");
const { readFileSync, writeFileSync, existsSync } = require("fs");
const { resolve } = require("path");

const SCRIPT_DIR = __dirname;
const SR_VALIDATION_HTML = resolve(SCRIPT_DIR, "packages/browser/tests/sr-validation-auto.html");
const CHAT_A11Y_JS = resolve(SCRIPT_DIR, "packages/browser/chat-a11y.js");

const TEST_SECTIONS = [
  {
    id: "test-1",
    name: "Python Code Block",
    expected: ["Python", "End Python", "code block"],
  },
  {
    id: "test-2",
    name: "JavaScript Code Block",
    expected: ["Javascript", "End Javascript"],
  },
  {
    id: "test-3",
    name: "Table",
    expected: ["Table", "3 columns", "End Table"],
  },
  {
    id: "test-4",
    name: "Headings",
    expected: ["Heading", "Subheading"],
  },
  {
    id: "test-5",
    name: "Blockquote",
    expected: ["Quote"],
  },
  {
    id: "test-6",
    name: "Lists",
    expected: ["bulleted list", "numbered list"],
  },
  {
    id: "test-7",
    name: "Horizontal Rule",
    expected: ["Separator"],
  },
  {
    id: "test-8",
    name: "Image",
    expected: ["Image"],
  },
  {
    id: "test-9",
    name: "Mixed Content",
    expected: ["Heading", "Python", "Quote", "Table", "list"],
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      config.output = args[i + 1];
      i++;
    }
  }
  return config;
}

function checkPhraseMatchesExpected(phrases, expected) {
  const joined = phrases.join(" ").toLowerCase();
  const matched = [];
  const missed = [];
  for (const exp of expected) {
    if (joined.includes(exp.toLowerCase())) {
      matched.push(exp);
    } else {
      missed.push(exp);
    }
  }
  return { matched, missed, pass: missed.length === 0 };
}

function setupDOM() {
  const html = readFileSync(SR_VALIDATION_HTML, "utf-8");
  const dom = new JSDOM(html, {
    url: "http://localhost/tests/sr-validation-auto.html",
    pretendToBeVisual: true,
    runScripts: "dangerously",
  });

  const { window } = dom;
  const { document } = window;

  const scriptSource = readFileSync(CHAT_A11Y_JS, "utf-8");
  delete window.__claudeA11yInjected;
  const fn = new window.Function(scriptSource);
  fn();

  if (window.__ca11yScan) {
    window.__ca11yScan();
  }

  return { dom, window, document };
}

async function runVirtualScreenReaderTest(document, window) {
  const { virtual } = require("@guidepup/virtual-screen-reader");

  console.log("Virtual Screen Reader Validation");
  console.log("================================");
  console.log("");

  const results = [];
  let sectionIndex = 0;

  for (const section of TEST_SECTIONS) {
    sectionIndex++;
    process.stdout.write(`  Test ${sectionIndex}: ${section.name}... `);

    const sectionEl = document.querySelectorAll(".test-section")[sectionIndex - 1];
    if (!sectionEl) {
      console.log("SKIP (section not found in DOM)");
      results.push({
        ...section,
        section_index: sectionIndex,
        found: false,
        phrases: [],
        item_texts: [],
        pass: false,
        matched: [],
        missed: section.expected,
      });
      continue;
    }

    try {
      await virtual.start({ container: sectionEl, window });

      const firstPhrase = await virtual.lastSpokenPhrase();
      let seenFirst = false;
      const MAX_STEPS = 150;

      for (let step = 0; step < MAX_STEPS; step++) {
        await virtual.next();
        const phrase = await virtual.lastSpokenPhrase();
        if (phrase === firstPhrase) {
          if (seenFirst) break;
          seenFirst = true;
        }
      }

      const allPhrases = await virtual.spokenPhraseLog();
      const allItemTexts = await virtual.itemTextLog();

      const uniquePhrases = [...new Set(allPhrases)];

      await virtual.stop();

      const { matched, missed, pass } = checkPhraseMatchesExpected(uniquePhrases, section.expected);

      const status = pass ? "PASS" : "FAIL";
      console.log(`${status} (${matched.length}/${section.expected.length})`);
      if (missed.length > 0) {
        console.log(`    Missing: ${missed.join(", ")}`);
      }

      results.push({
        ...section,
        section_index: sectionIndex,
        found: true,
        phrases: uniquePhrases,
        item_texts: [...new Set(allItemTexts)],
        pass,
        matched,
        missed,
      });
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({
        ...section,
        section_index: sectionIndex,
        found: true,
        phrases: [],
        item_texts: [],
        pass: false,
        matched: [],
        missed: section.expected,
        error: err.message,
      });

      try { await virtual.stop(); } catch (_) { /* ignore */ }
    }
  }

  return results;
}

async function main() {
  const config = parseArgs();

  if (!existsSync(SR_VALIDATION_HTML)) {
    console.error(`Error: sr-validation-auto.html not found at ${SR_VALIDATION_HTML}`);
    process.exit(1);
  }
  if (!existsSync(CHAT_A11Y_JS)) {
    console.error(`Error: chat-a11y.js not found at ${CHAT_A11Y_JS}`);
    process.exit(1);
  }

  console.log("Loading sr-validation-auto.html in jsdom...");
  console.log("Injecting chat-a11y.js...");
  const { document, window } = setupDOM();
  console.log("DOM ready. Running virtual screen reader...\n");

  const results = await runVirtualScreenReaderTest(document, window);

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const exitCode = passed < total ? 1 : 0;

  console.log("");
  console.log("===============================");
  console.log(`  RESULTS: ${passed}/${total} passed`);
  console.log("===============================");

  const output = {
    timestamp: new Date().toISOString(),
    method: "virtual-screen-reader",
    results: { virtual: results },
    summary: {
      virtual: { passed, failed: total - passed, total },
    },
  };

  const outputPath = config.output || resolve(SCRIPT_DIR, "recordings", "results", "browser-voiceover-results.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults written to ${outputPath}`);

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
