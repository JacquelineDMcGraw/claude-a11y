/**
 * content.js — Chrome extension content script for Claude Accessible.
 *
 * Manifest V3 content scripts run in an isolated world and cannot access
 * the page's JavaScript context (window, globals, etc.). chat-a11y.js
 * needs to run in the MAIN world so it can set window.__claudeA11yInjected,
 * window.__ca11yScan, etc.
 *
 * Technique: create a <script> element with the full source of chat-a11y.js
 * as its textContent, append it to <html>, then immediately remove it.
 * The code executes synchronously in the main world before removal.
 */
(function () {
  "use strict";

  // Fetch the bundled chat-a11y.js source from the extension package
  var scriptURL = chrome.runtime.getURL("chat-a11y.js");

  fetch(scriptURL)
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Failed to load chat-a11y.js: " + response.status);
      }
      return response.text();
    })
    .then(function (source) {
      var script = document.createElement("script");
      script.textContent = source;
      document.documentElement.appendChild(script);
      script.remove();
      console.log("[claude-accessible] Injected chat-a11y.js into main world.");
    })
    .catch(function (err) {
      console.error("[claude-accessible] Injection failed:", err);
    });
})();
