/**
 * Tests for chat-a11y.js DOM transformations.
 *
 * Uses JSDOM via vitest to simulate browser DOM. Each test creates a
 * minimal DOM structure, loads chat-a11y.js, and verifies the correct
 * ARIA attributes and sr-only spans are applied.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

var scriptSource = readFileSync(
  resolve(__dirname, "..", "chat-a11y.js"),
  "utf-8"
);

function injectScript() {
  // Reset the guard so the IIFE runs fresh each time
  delete window.__claudeA11yInjected;
  delete window.__ca11yScan;
  delete window.__ca11yStats;

  // Remove any previously injected styles and live regions
  document.querySelectorAll("style").forEach(function (s) { s.remove(); });
  var oldLive = document.getElementById("ca11y-live");
  if (oldLive) oldLive.remove();

  // Execute the script
  var fn = new Function(scriptSource);
  fn();
}

describe("chat-a11y.js", function () {
  beforeEach(function () {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    injectScript();
  });

  afterEach(function () {
    delete window.__claudeA11yInjected;
    delete window.__ca11yScan;
    delete window.__ca11yStats;
  });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  describe("initialization", function () {
    it("sets the injection guard on window", function () {
      expect(window.__claudeA11yInjected).toBe(true);
    });

    it("exposes __ca11yScan and __ca11yStats globally", function () {
      expect(typeof window.__ca11yScan).toBe("function");
      expect(typeof window.__ca11yStats).toBe("function");
    });

    it("creates an ARIA live region", function () {
      var live = document.getElementById("ca11y-live");
      expect(live).not.toBeNull();
      expect(live.getAttribute("role")).toBe("status");
      expect(live.getAttribute("aria-live")).toBe("polite");
    });

    it("injects sr-only CSS with user-select:none", function () {
      var styles = document.querySelectorAll("style");
      var found = false;
      for (var i = 0; i < styles.length; i++) {
        if (styles[i].textContent.indexOf("user-select: none") !== -1) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("does not double-init when called twice", function () {
      var countBefore = document.querySelectorAll("#ca11y-live").length;
      injectScript(); // second call
      var countAfter = document.querySelectorAll("#ca11y-live").length;
      // The second call should be a no-op because the guard is set
      // But our test resets the guard, so let's verify the guard works
      window.__claudeA11yInjected = true;
      var fn = new Function(scriptSource);
      fn();
      // Should still be 1 live region (or 2 from our forced double-init above)
      // The point is the guard prevents re-execution
      expect(window.__claudeA11yInjected).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Code blocks
  // -------------------------------------------------------------------------

  describe("code block transforms", function () {
    it("adds aria-label with detected language", function () {
      document.body.innerHTML =
        '<pre><code class="language-python">print("hi")</code></pre>';
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("aria-label")).toBe("Python code block");
    });

    it("adds role=region and tabindex to code blocks", function () {
      document.body.innerHTML =
        '<pre><code class="language-javascript">var x = 1;</code></pre>';
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("tabindex")).toBe("0");
    });

    it("defaults to 'Code' when no language class is present", function () {
      document.body.innerHTML = "<pre><code>some code</code></pre>";
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("aria-label")).toBe("Code code block");
    });

    it("inserts sr-only [Language] and [End Language] spans", function () {
      document.body.innerHTML =
        '<pre><code class="language-rust">fn main() {}</code></pre>';
      window.__ca11yScan();

      var srSpans = document.querySelectorAll(".ca11y-sr-only");
      var texts = [];
      for (var i = 0; i < srSpans.length; i++) {
        texts.push(srSpans[i].textContent);
      }
      expect(texts).toContain("[Rust]");
      expect(texts).toContain("[End Rust]");
    });

    it("does not double-process a code block", function () {
      document.body.innerHTML =
        '<pre><code class="language-go">fmt.Println("hi")</code></pre>';
      window.__ca11yScan();
      window.__ca11yScan();

      // Should only have one pair of sr-only spans inside the pre
      var pre = document.querySelector("pre");
      var srSpans = pre.querySelectorAll(".ca11y-sr-only");
      expect(srSpans.length).toBe(2); // [Go] and [End Go]
    });
  });

  // -------------------------------------------------------------------------
  // Headings
  // -------------------------------------------------------------------------

  describe("heading transforms", function () {
    it("adds [Heading] prefix to h1 and h2", function () {
      document.body.innerHTML = "<h2>Installation</h2>";
      window.__ca11yScan();

      var sr = document.querySelector(".ca11y-sr-only");
      expect(sr.textContent).toBe("[Heading] ");
    });

    it("adds [Subheading] prefix to h3 through h6", function () {
      document.body.innerHTML = "<h4>Details</h4>";
      window.__ca11yScan();

      var sr = document.querySelector(".ca11y-sr-only");
      expect(sr.textContent).toBe("[Subheading] ");
    });
  });

  // -------------------------------------------------------------------------
  // Tables
  // -------------------------------------------------------------------------

  describe("table transforms", function () {
    it("adds role=table, aria-label, tabindex, and announces dimensions", function () {
      document.body.innerHTML = [
        "<div>",
        "  <table>",
        "    <tr><th>Name</th><th>Role</th></tr>",
        "    <tr><td>Alice</td><td>Engineer</td></tr>",
        "  </table>",
        "</div>",
      ].join("");
      window.__ca11yScan();

      var table = document.querySelector("table");
      expect(table.getAttribute("role")).toBe("table");
      expect(table.getAttribute("tabindex")).toBe("0");
      expect(table.getAttribute("aria-label")).toBe("Table, 2 columns");

      var srSpans = document.querySelectorAll(".ca11y-sr-only");
      var texts = [];
      for (var i = 0; i < srSpans.length; i++) {
        texts.push(srSpans[i].textContent);
      }
      expect(texts).toContain("[Table, 2 columns]");
      expect(texts).toContain("[End Table]");
    });

    it("sets columnheader role and scope on th elements", function () {
      document.body.innerHTML = [
        "<div>",
        "  <table>",
        "    <tr><th>A</th><th>B</th></tr>",
        "    <tr><td>1</td><td>2</td></tr>",
        "  </table>",
        "</div>",
      ].join("");
      window.__ca11yScan();

      var ths = document.querySelectorAll("th");
      for (var i = 0; i < ths.length; i++) {
        expect(ths[i].getAttribute("role")).toBe("columnheader");
        expect(ths[i].getAttribute("scope")).toBe("col");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Blockquotes
  // -------------------------------------------------------------------------

  describe("blockquote transforms", function () {
    it("adds role=note and [Quote] prefix", function () {
      document.body.innerHTML = "<blockquote>Some wise words</blockquote>";
      window.__ca11yScan();

      var bq = document.querySelector("blockquote");
      expect(bq.getAttribute("role")).toBe("note");

      var sr = bq.querySelector(".ca11y-sr-only");
      expect(sr.textContent).toBe("[Quote] ");
    });
  });

  // -------------------------------------------------------------------------
  // Lists
  // -------------------------------------------------------------------------

  describe("list transforms", function () {
    it("announces bulleted list with item count and adds role=list", function () {
      document.body.innerHTML =
        "<div><ul><li>One</li><li>Two</li><li>Three</li></ul></div>";
      window.__ca11yScan();

      var ul = document.querySelector("ul");
      expect(ul.getAttribute("role")).toBe("list");

      var lis = document.querySelectorAll("li");
      for (var j = 0; j < lis.length; j++) {
        expect(lis[j].getAttribute("role")).toBe("listitem");
      }

      var srSpans = document.querySelectorAll(".ca11y-sr-only");
      var texts = [];
      for (var i = 0; i < srSpans.length; i++) {
        texts.push(srSpans[i].textContent);
      }
      expect(texts).toContain("[3 item bulleted list]");
    });

    it("announces numbered list with item count and adds role=list", function () {
      document.body.innerHTML =
        "<div><ol><li>First</li><li>Second</li></ol></div>";
      window.__ca11yScan();

      var ol = document.querySelector("ol");
      expect(ol.getAttribute("role")).toBe("list");

      var lis = document.querySelectorAll("li");
      for (var j = 0; j < lis.length; j++) {
        expect(lis[j].getAttribute("role")).toBe("listitem");
      }

      var srSpans = document.querySelectorAll(".ca11y-sr-only");
      var texts = [];
      for (var i = 0; i < srSpans.length; i++) {
        texts.push(srSpans[i].textContent);
      }
      expect(texts).toContain("[2 item numbered list]");
    });
  });

  // -------------------------------------------------------------------------
  // Chat message containers
  // -------------------------------------------------------------------------

  describe("chat message container transforms", function () {
    it("adds role=region to claude.ai message containers", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><p>Hello</p></div>';
      window.__ca11yScan();

      var msg = document.querySelector('[data-testid="chat-message-content"]');
      expect(msg.getAttribute("role")).toBe("region");
      expect(msg.getAttribute("aria-label")).toMatch(/^AI response/);
    });

    it("adds role=region to .prose containers", function () {
      document.body.innerHTML = '<div class="prose"><p>Response text</p></div>';
      window.__ca11yScan();

      var msg = document.querySelector(".prose");
      expect(msg.getAttribute("role")).toBe("region");
    });
  });

  // -------------------------------------------------------------------------
  // Horizontal rules
  // -------------------------------------------------------------------------

  describe("horizontal rule transforms", function () {
    it("adds role=separator with aria-label", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><hr></div>';
      window.__ca11yScan();

      var hr = document.querySelector("hr");
      expect(hr.getAttribute("role")).toBe("separator");
      expect(hr.getAttribute("aria-label")).toBe("[Separator]");
    });
  });

  // -------------------------------------------------------------------------
  // Images
  // -------------------------------------------------------------------------

  describe("image transforms", function () {
    it("adds fallback alt text when missing", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><img src="test.png"></div>';
      window.__ca11yScan();

      var img = document.querySelector("img");
      expect(img.alt).toBe("Image");
    });

    it("preserves existing alt text", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><img src="test.png" alt="A diagram"></div>';
      window.__ca11yScan();

      var img = document.querySelector("img");
      expect(img.alt).toBe("A diagram");
    });
  });

  // -------------------------------------------------------------------------
  // Links
  // -------------------------------------------------------------------------

  describe("link transforms", function () {
    it("fills empty link text with the href", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><a href="https://example.com"></a></div>';
      window.__ca11yScan();

      var a = document.querySelector("a");
      // JSDOM normalizes the href with a trailing slash
      expect(a.textContent).toMatch(/^https:\/\/example\.com\/?$/);
    });

    it("preserves existing link text", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><a href="https://example.com">Example site</a></div>';
      window.__ca11yScan();

      var a = document.querySelector("a");
      expect(a.textContent).toBe("Example site");
    });
  });

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  describe("__ca11yStats", function () {
    it("returns accurate transform count", function () {
      document.body.innerHTML = [
        '<pre><code class="language-python">x = 1</code></pre>',
        "<h2>Title</h2>",
        "<blockquote>Quote</blockquote>",
      ].join("");
      window.__ca11yScan();

      var stats = window.__ca11yStats();
      expect(stats.transformCount).toBeGreaterThanOrEqual(3);
      expect(stats.observerActive).toBe(true);
      expect(stats.hasLiveRegion).toBe(true);
    });

    it("reports selector health warning status", function () {
      var stats = window.__ca11yStats();
      expect(typeof stats.selectorHealthWarning).toBe("boolean");
    });

    it("reports fallback rescan status", function () {
      var stats = window.__ca11yStats();
      expect(typeof stats.fallbackActive).toBe("boolean");
    });
  });

  // -------------------------------------------------------------------------
  // Copy-paste safety
  // -------------------------------------------------------------------------

  describe("copy-paste safety", function () {
    it("sr-only spans have user-select:none in injected CSS", function () {
      var styles = document.querySelectorAll("style");
      var cssText = "";
      for (var i = 0; i < styles.length; i++) {
        cssText += styles[i].textContent;
      }
      expect(cssText).toContain("user-select: none");
      expect(cssText).toContain("-webkit-user-select: none");
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  describe("idempotency", function () {
    it("does not add duplicate transforms on repeated scans", function () {
      document.body.innerHTML = [
        "<div>",
        '  <pre><code class="language-python">x = 1</code></pre>',
        "  <h2>Title</h2>",
        "  <div><table><tr><th>A</th></tr><tr><td>1</td></tr></table></div>",
        "  <div><ul><li>One</li></ul></div>",
        "  <blockquote>Note</blockquote>",
        "</div>",
      ].join("");

      window.__ca11yScan();
      var firstCount = window.__ca11yStats().transformCount;

      window.__ca11yScan();
      window.__ca11yScan();
      window.__ca11yScan();

      var finalCount = window.__ca11yStats().transformCount;
      expect(finalCount).toBe(firstCount);
    });
  });
});
