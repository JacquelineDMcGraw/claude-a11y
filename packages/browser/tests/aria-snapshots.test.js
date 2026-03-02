/**
 * ARIA snapshot tests — verify the exact accessible name, role, and
 * state that screen readers will see for every transform type.
 *
 * These tests function as recorded screen reader output: each assertion
 * documents exactly what NVDA/JAWS/VoiceOver should announce. If a
 * transform changes, these tests break, forcing an update to the
 * "expected screen reader output" documentation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

var scriptSource = readFileSync(
  resolve(__dirname, "..", "chat-a11y.js"),
  "utf-8"
);

function injectScript() {
  delete window.__claudeA11yInjected;
  delete window.__ca11yScan;
  delete window.__ca11yStats;
  document.querySelectorAll("style").forEach(function (s) { s.remove(); });
  var oldLive = document.getElementById("ca11y-live");
  if (oldLive) oldLive.remove();
  var fn = new Function(scriptSource);
  fn();
}

function getAccessibleTree(root) {
  var tree = [];
  var walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    null,
    false
  );
  var node = walker.nextNode();
  while (node) {
    var role = node.getAttribute("role");
    var label = node.getAttribute("aria-label");
    var hidden = node.getAttribute("aria-hidden");
    if (role || label) {
      tree.push({
        tag: node.tagName.toLowerCase(),
        role: role,
        label: label,
        hidden: hidden,
        className: node.className || undefined,
      });
    }
    node = walker.nextNode();
  }
  return tree;
}

describe("ARIA snapshot: screen reader output expectations", function () {
  beforeEach(function () {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    injectScript();
  });

  // -------------------------------------------------------------------------
  // Code blocks
  // -------------------------------------------------------------------------

  it("Python code block: exact ARIA tree", function () {
    document.body.innerHTML =
      '<pre><code class="language-python">def hello():\n    print("hi")</code></pre>';
    window.__ca11yScan();

    var pre = document.querySelector("pre");
    expect(pre.getAttribute("aria-label")).toBe("Python code block");
    expect(pre.getAttribute("role")).toBe("region");
    expect(pre.getAttribute("tabindex")).toBe("0");

    var srSpans = pre.querySelectorAll(".ca11y-sr-only");
    expect(srSpans.length).toBe(2);

    expect(srSpans[0].textContent).toBe("[Python]");
    expect(srSpans[0].getAttribute("role")).toBe("note");
    expect(srSpans[0].getAttribute("aria-hidden")).toBe("false");

    expect(srSpans[1].textContent).toBe("[End Python]");
    expect(srSpans[1].getAttribute("role")).toBe("note");
    expect(srSpans[1].getAttribute("aria-hidden")).toBe("false");
  });

  it("code block with no language: announces as Code", function () {
    document.body.innerHTML = "<pre><code>x = 1</code></pre>";
    window.__ca11yScan();

    var pre = document.querySelector("pre");
    expect(pre.getAttribute("aria-label")).toBe("Code code block");

    var srSpans = pre.querySelectorAll(".ca11y-sr-only");
    expect(srSpans[0].textContent).toBe("[Code]");
    expect(srSpans[1].textContent).toBe("[End Code]");
  });

  it("inline code: no role or aria-label (native semantics preserved)", function () {
    document.body.innerHTML =
      '<div data-testid="chat-message-content"><p><code>npm install</code></p></div>';
    window.__ca11yScan();

    var code = document.querySelector("code");
    expect(code.getAttribute("role")).toBeNull();
    expect(code.getAttribute("aria-label")).toBeNull();
    expect(code.dataset.ca11y).toBe("1");
  });

  // -------------------------------------------------------------------------
  // Headings
  // -------------------------------------------------------------------------

  it("h1: screen reader hears [Heading] prefix", function () {
    document.body.innerHTML = "<h1>Getting Started</h1>";
    window.__ca11yScan();

    var h1 = document.querySelector("h1");
    var sr = h1.querySelector(".ca11y-sr-only");
    expect(sr.textContent).toBe("[Heading] ");
    expect(sr.getAttribute("aria-hidden")).toBe("false");
  });

  it("h2: screen reader hears [Heading] prefix", function () {
    document.body.innerHTML = "<h2>Installation</h2>";
    window.__ca11yScan();

    var sr = document.querySelector("h2 .ca11y-sr-only");
    expect(sr.textContent).toBe("[Heading] ");
  });

  it("h3: screen reader hears [Subheading] prefix", function () {
    document.body.innerHTML = "<h3>Prerequisites</h3>";
    window.__ca11yScan();

    var sr = document.querySelector("h3 .ca11y-sr-only");
    expect(sr.textContent).toBe("[Subheading] ");
  });

  it("h5: screen reader hears [Subheading] prefix", function () {
    document.body.innerHTML = "<h5>Note</h5>";
    window.__ca11yScan();

    var sr = document.querySelector("h5 .ca11y-sr-only");
    expect(sr.textContent).toBe("[Subheading] ");
  });

  // -------------------------------------------------------------------------
  // Tables
  // -------------------------------------------------------------------------

  it("table: announces column count and has proper header roles", function () {
    document.body.innerHTML = [
      "<div>",
      "  <table>",
      "    <tr><th>Name</th><th>OS</th><th>Status</th></tr>",
      "    <tr><td>NVDA</td><td>Windows</td><td>OK</td></tr>",
      "    <tr><td>JAWS</td><td>Windows</td><td>OK</td></tr>",
      "  </table>",
      "</div>",
    ].join("");
    window.__ca11yScan();

    var table = document.querySelector("table");
    expect(table.getAttribute("role")).toBe("table");
    expect(table.getAttribute("tabindex")).toBe("0");
    expect(table.getAttribute("aria-label")).toBe("[Table, 3 columns]");

    var srSpans = document.querySelectorAll(".ca11y-sr-only");
    var texts = [];
    for (var i = 0; i < srSpans.length; i++) texts.push(srSpans[i].textContent);
    expect(texts).toContain("[Table, 3 columns]");
    expect(texts).toContain("[End Table]");

    var ths = document.querySelectorAll("th");
    for (var j = 0; j < ths.length; j++) {
      expect(ths[j].getAttribute("role")).toBe("columnheader");
      expect(ths[j].getAttribute("scope")).toBe("col");
    }
  });

  // -------------------------------------------------------------------------
  // Blockquotes
  // -------------------------------------------------------------------------

  it("blockquote: role=note with [Quote] prefix", function () {
    document.body.innerHTML = "<blockquote>Think different.</blockquote>";
    window.__ca11yScan();

    var bq = document.querySelector("blockquote");
    expect(bq.getAttribute("role")).toBe("note");

    var sr = bq.querySelector(".ca11y-sr-only");
    expect(sr.textContent).toBe("[Quote] ");
    expect(sr.getAttribute("role")).toBe(null);
  });

  // -------------------------------------------------------------------------
  // Lists
  // -------------------------------------------------------------------------

  it("unordered list: announces item count, type, and has role=list", function () {
    document.body.innerHTML =
      "<div><ul><li>Alpha</li><li>Beta</li><li>Gamma</li></ul></div>";
    window.__ca11yScan();

    var ul = document.querySelector("ul");
    expect(ul.getAttribute("role")).toBe("list");
    var lis = document.querySelectorAll("li");
    for (var i = 0; i < lis.length; i++) {
      expect(lis[i].getAttribute("role")).toBe("listitem");
    }

    var sr = document.querySelector(".ca11y-sr-only");
    expect(sr.textContent).toBe("[3 item bulleted list]");
    expect(sr.getAttribute("role")).toBe("note");
  });

  it("ordered list: announces item count, type, and has role=list", function () {
    document.body.innerHTML =
      "<div><ol><li>First</li><li>Second</li></ol></div>";
    window.__ca11yScan();

    var ol = document.querySelector("ol");
    expect(ol.getAttribute("role")).toBe("list");

    var sr = document.querySelector(".ca11y-sr-only");
    expect(sr.textContent).toBe("[2 item numbered list]");
  });

  // -------------------------------------------------------------------------
  // Horizontal rules
  // -------------------------------------------------------------------------

  it("hr: role=separator with [Separator] label", function () {
    document.body.innerHTML =
      '<div data-testid="chat-message-content"><hr></div>';
    window.__ca11yScan();

    var hr = document.querySelector("hr");
    expect(hr.getAttribute("role")).toBe("separator");
    expect(hr.getAttribute("aria-label")).toBe("[Separator]");
  });

  // -------------------------------------------------------------------------
  // Images
  // -------------------------------------------------------------------------

  it("image without alt: gets fallback alt=Image and role=img", function () {
    document.body.innerHTML =
      '<div data-testid="chat-message-content"><img src="x.png"></div>';
    window.__ca11yScan();

    var img = document.querySelector("img");
    expect(img.alt).toBe("Image");
    expect(img.getAttribute("role")).toBe("img");
  });

  it("image with alt: preserves original alt, adds role=img", function () {
    document.body.innerHTML =
      '<div data-testid="chat-message-content"><img src="x.png" alt="Diagram"></div>';
    window.__ca11yScan();

    var img = document.querySelector("img");
    expect(img.alt).toBe("Diagram");
    expect(img.getAttribute("role")).toBe("img");
  });

  // -------------------------------------------------------------------------
  // Links
  // -------------------------------------------------------------------------

  it("empty link: gets href as visible text", function () {
    document.body.innerHTML =
      '<div data-testid="chat-message-content"><a href="https://example.com"></a></div>';
    window.__ca11yScan();

    var a = document.querySelector("a");
    expect(a.textContent).toMatch(/^https:\/\/example\.com\/?$/);
  });

  // -------------------------------------------------------------------------
  // Chat message containers
  // -------------------------------------------------------------------------

  it("claude.ai message container: role=region, aria-label=AI response", function () {
    document.body.innerHTML =
      '<div data-testid="chat-message-content"><p>Hello</p></div>';
    window.__ca11yScan();

    var msg = document.querySelector('[data-testid="chat-message-content"]');
    expect(msg.getAttribute("role")).toBe("region");
    expect(msg.getAttribute("aria-label")).toMatch(/AI response/);
  });

  // -------------------------------------------------------------------------
  // Live region
  // -------------------------------------------------------------------------

  it("live region exists with correct ARIA attributes", function () {
    var live = document.getElementById("ca11y-live");
    expect(live).not.toBeNull();
    expect(live.getAttribute("role")).toBe("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.getAttribute("aria-atomic")).toBe("true");
  });

  // -------------------------------------------------------------------------
  // Full response snapshot
  // -------------------------------------------------------------------------

  it("complete AI response: full ARIA tree matches expected output", function () {
    document.body.innerHTML = [
      '<div data-testid="chat-message-content">',
      "  <h2>Setup</h2>",
      "  <p>Run this command:</p>",
      '  <pre><code class="language-bash">npm install</code></pre>',
      "  <blockquote>Requires Node 18+</blockquote>",
      "  <ul><li>Step 1</li><li>Step 2</li></ul>",
      "  <hr>",
      "</div>",
    ].join("\n");
    window.__ca11yScan();

    var container = document.querySelector('[data-testid="chat-message-content"]');
    expect(container.getAttribute("role")).toBe("region");
    expect(container.getAttribute("aria-label")).toMatch(/AI response/);

    var tree = getAccessibleTree(container);

    var roles = tree.map(function (n) { return n.role; }).filter(Boolean);
    expect(roles).toContain("note");
    expect(roles).toContain("separator");

    var labels = tree.map(function (n) { return n.label; }).filter(Boolean);
    expect(labels).toContain("Bash code block");
    expect(labels).toContain("[Separator]");

    var srTexts = [];
    container.querySelectorAll(".ca11y-sr-only").forEach(function (el) {
      srTexts.push(el.textContent);
    });

    expect(srTexts).toContain("[Heading] ");
    expect(srTexts).toContain("[Bash]");
    expect(srTexts).toContain("[End Bash]");
    expect(srTexts).toContain("[Quote] ");
    expect(srTexts).toContain("[2 item bulleted list]");
  });

  // -------------------------------------------------------------------------
  // Site adapter detection
  // -------------------------------------------------------------------------

  it("__ca11yStats reports site adapter name", function () {
    var stats = window.__ca11yStats();
    expect(stats.siteAdapter).toBeDefined();
    expect(typeof stats.siteAdapter).toBe("string");
  });

  it("__ca11yAdapters is exposed globally", function () {
    expect(Array.isArray(window.__ca11yAdapters)).toBe(true);
    expect(window.__ca11yAdapters.length).toBeGreaterThanOrEqual(5);

    var names = window.__ca11yAdapters.map(function (a) { return a.name; });
    expect(names).toContain("claude");
    expect(names).toContain("chatgpt");
    expect(names).toContain("gemini");
    expect(names).toContain("copilot");
    expect(names).toContain("cursor");
  });
});
