/**
 * content.js — Chrome extension content script for Claude Accessible.
 *
 * Manifest V3 content scripts run in an isolated world and cannot access
 * the page's JavaScript context (window, globals, etc.). chat-a11y.js
 * needs to run in the MAIN world so it can set window.__claudeA11yInjected,
 * window.__ca11yScan, etc.
 *
 * Technique: create a <script> element with src pointing to the
 * web_accessible_resource URL. This avoids CSP inline-script blocks.
 */
(function () {
  "use strict";

  var phrasingURL = chrome.runtime.getURL("phrasing.js");
  var chatURL = chrome.runtime.getURL("chat-a11y.js");

  var phrasing = document.createElement("script");
  phrasing.src = phrasingURL;
  phrasing.onload = function () {
    phrasing.remove();
    var main = document.createElement("script");
    main.src = chatURL;
    main.onload = function () {
      console.log("[claude-accessible] Injected chat-a11y.js into main world.");
      main.remove();
    };
    main.onerror = function () {
      console.error("[claude-accessible] Failed to load chat-a11y.js");
    };
    (document.head || document.documentElement).appendChild(main);
  };
  phrasing.onerror = function () {
    console.error("[claude-accessible] Failed to load phrasing.js");
  };
  (document.head || document.documentElement).appendChild(phrasing);
})();
