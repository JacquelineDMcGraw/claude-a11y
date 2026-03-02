/**
 * Automated accessibility tests using axe-core.
 *
 * Runs axe-core against DOM structures produced by chat-a11y.js
 * to verify that our transforms don't introduce ARIA violations.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import axe from "axe-core";

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

async function runAxe(context) {
  var results = await axe.run(context || document.body, {
    rules: {
      region: { enabled: false },
      "page-has-heading-one": { enabled: false },
      "landmark-one-main": { enabled: false },
      "html-has-lang": { enabled: false },
      "document-title": { enabled: false },
      bypass: { enabled: false },
    },
  });
  return results.violations;
}

describe("axe-core accessibility audit", function () {
  beforeEach(function () {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    injectScript();
  });

  it("code block transforms produce zero axe violations", async function () {
    document.body.innerHTML =
      '<div><pre><code class="language-python">print("hello")</code></pre></div>';
    window.__ca11yScan();

    var violations = await runAxe();
    expect(violations).toEqual([]);
  });

  it("heading transforms produce zero axe violations", async function () {
    document.body.innerHTML = "<div><h1>Title</h1><h2>Subtitle</h2></div>";
    window.__ca11yScan();

    var violations = await runAxe();
    expect(violations).toEqual([]);
  });

  it("table transforms produce zero axe violations", async function () {
    document.body.innerHTML = [
      "<div>",
      "  <table>",
      "    <tr><th>Name</th><th>Role</th></tr>",
      "    <tr><td>Alice</td><td>Dev</td></tr>",
      "  </table>",
      "</div>",
    ].join("");
    window.__ca11yScan();

    var violations = await runAxe();
    expect(violations).toEqual([]);
  });

  it("blockquote transforms produce zero axe violations", async function () {
    document.body.innerHTML =
      "<div><blockquote>A wise person once said</blockquote></div>";
    window.__ca11yScan();

    var violations = await runAxe();
    expect(violations).toEqual([]);
  });

  it("list transforms produce zero axe violations", async function () {
    document.body.innerHTML =
      "<div><ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol></div>";
    window.__ca11yScan();

    var violations = await runAxe();
    expect(violations).toEqual([]);
  });

  it("chat message region transforms produce zero axe violations", async function () {
    document.body.innerHTML = [
      '<div data-testid="chat-message-content">',
      "  <p>Hello from Claude</p>",
      '  <pre><code class="language-javascript">console.log("hi")</code></pre>',
      "</div>",
    ].join("");
    window.__ca11yScan();

    var violations = await runAxe();
    expect(violations).toEqual([]);
  });

  it("mixed content page produces zero axe violations", async function () {
    document.body.innerHTML = [
      '<div data-testid="chat-message-content">',
      "  <h2>Setup Instructions</h2>",
      "  <p>Install the dependencies:</p>",
      '  <pre><code class="language-bash">npm install</code></pre>',
      "  <blockquote>Make sure Node 18+ is installed</blockquote>",
      "  <table><tr><th>Pkg</th><th>Version</th></tr><tr><td>node</td><td>20</td></tr></table>",
      "  <ul><li>Step one</li><li>Step two</li></ul>",
      "  <hr>",
      "  <p>That's it.</p>",
      "</div>",
    ].join("");
    window.__ca11yScan();

    var violations = await runAxe();
    if (violations.length > 0) {
      var details = violations.map(function (v) {
        return v.id + ": " + v.help + " (" + v.nodes.length + " nodes)";
      });
      console.error("axe violations:", details);
    }
    expect(violations).toEqual([]);
  });

  it("image transforms produce zero axe violations", async function () {
    document.body.innerHTML =
      '<div data-testid="chat-message-content"><img src="test.png"><img src="diagram.png" alt="Architecture diagram"></div>';
    window.__ca11yScan();

    var img = document.querySelector('img[src="test.png"]');
    expect(img.alt).toBe("Image");

    var violations = await runAxe();
    expect(violations).toEqual([]);
  });
});
