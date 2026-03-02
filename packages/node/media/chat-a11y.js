/**
 * chat-a11y.js — DOM injection script for AI chat accessibility.
 *
 * Works in Cursor/VS Code (via workbench.html patch) AND Claude Desktop
 * (via DevTools console injection). Also works on claude.ai in browsers.
 *
 * Uses a MutationObserver to watch for new chat messages and transforms
 * rendered markdown into screen-reader-friendly markup in-place.
 *
 * Does NOT change visual appearance — only adds ARIA attributes,
 * roles, and sr-only announcements that screen readers pick up.
 */
(function () {
  "use strict";

  // Prevent double-init
  if (window.__claudeA11yInjected) return;
  window.__claudeA11yInjected = true;

  var LOG_PREFIX = "[claude-a11y]";
  var DEBUG = !!(window.__ca11yDebug || (typeof sessionStorage !== "undefined" && sessionStorage.getItem("ca11y-debug")));

  function debugLog() {
    if (DEBUG) console.log.apply(console, arguments);
  }

  // ---------------------------------------------------------------------------
  // 0. Configuration — user-overridable announcement phrasing and behavior.
  //    Override via window.__ca11yConfig before this script loads, or call
  //    __ca11yConfig() at runtime. Every key has a sensible default.
  // ---------------------------------------------------------------------------
  // Import canonical phrasing if available (loaded via phrasing.js on window)
  var phrasing = (typeof window.__ca11yPhrasing === "object" && window.__ca11yPhrasing) || {};

  var defaultConfig = {
    enabled: true,
    showRawToggle: true,
    codeBlockStart: phrasing.codeBlockStart || "[{lang}]",
    codeBlockEnd: phrasing.codeBlockEnd || "[End {lang}]",
    codeBlockDefault: phrasing.codeBlockDefault || "Code",
    headingPrefix: phrasing.headingPrefix || "[Heading]",
    subheadingPrefix: phrasing.subheadingPrefix || "[Subheading]",
    quotePrefix: phrasing.quotePrefix || "[Quote]",
    tableStart: phrasing.tableStart || "[Table, {cols} columns]",
    tableEnd: phrasing.tableEnd || "[End Table]",
    listAnnouncement: phrasing.listAnnouncement || "[{count} item {type} list]",
    separatorLabel: phrasing.separator || "[Separator]",
    responseLabel: phrasing.responseLabel || "AI response",
  };

  var userConfig = (typeof window.__ca11yConfig === "object" && window.__ca11yConfig) || {};
  var config = {};
  var k;
  for (k in defaultConfig) {
    if (defaultConfig.hasOwnProperty(k)) {
      config[k] = userConfig.hasOwnProperty(k) ? userConfig[k] : defaultConfig[k];
    }
  }

  // ---------------------------------------------------------------------------
  // 0b. TrustedTypes policy (required by Cursor's strict CSP)
  // ---------------------------------------------------------------------------
  var policy = null;
  try {
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      policy = window.trustedTypes.createPolicy("claudeA11y", {
        createHTML: function (s) { return s; },
        createScript: function (s) { return s; },
        createScriptURL: function (s) { return s; },
      });
      debugLog(LOG_PREFIX, "TrustedTypes policy created.");
    }
  } catch (e) {
    console.warn(LOG_PREFIX, "Could not create TrustedTypes policy:", e.message);
  }

  // ---------------------------------------------------------------------------
  // 1. Inject sr-only CSS (visually hidden, readable by screen readers)
  //    user-select:none prevents sr-only text from polluting clipboard on copy
  // ---------------------------------------------------------------------------
  try {
    var style = document.createElement("style");
    style.textContent = [
      ".ca11y-sr-only {",
      "  position: absolute !important;",
      "  width: 1px !important;",
      "  height: 1px !important;",
      "  padding: 0 !important;",
      "  margin: -1px !important;",
      "  overflow: hidden !important;",
      "  clip: rect(0, 0, 0, 0) !important;",
      "  white-space: nowrap !important;",
      "  border: 0 !important;",
      "  -webkit-user-select: none !important;",
      "  -moz-user-select: none !important;",
      "  -ms-user-select: none !important;",
      "  user-select: none !important;",
      "}",
      ".ca11y-live-region {",
      "  position: absolute !important;",
      "  width: 1px !important;",
      "  height: 1px !important;",
      "  overflow: hidden !important;",
      "  clip: rect(0, 0, 0, 0) !important;",
      "}",
      ".ca11y-global-toggle {",
      "  position: fixed;",
      "  bottom: 12px;",
      "  right: 12px;",
      "  padding: 6px 12px;",
      "  font-size: 13px;",
      "  font-family: system-ui, sans-serif;",
      "  background: rgba(0, 0, 0, 0.75);",
      "  color: #fff;",
      "  border: 2px solid transparent;",
      "  border-radius: 6px;",
      "  cursor: pointer;",
      "  z-index: 10000;",
      "  opacity: 0.01;",
      "  transition: opacity 0.2s, border-color 0.2s;",
      "}",
      ".ca11y-global-toggle:hover {",
      "  opacity: 1;",
      "}",
      ".ca11y-global-toggle:focus,",
      ".ca11y-global-toggle:focus-visible {",
      "  opacity: 1;",
      "  border-color: #58a6ff;",
      "  outline: 2px solid #58a6ff;",
      "  outline-offset: 2px;",
      "}",
    ].join("\n");
    document.head.appendChild(style);
    debugLog(LOG_PREFIX, "Injected sr-only CSS.");
  } catch (e) {
    console.error(LOG_PREFIX, "Failed to inject CSS:", e.message);
  }

  // ---------------------------------------------------------------------------
  // 2. ARIA live region for streaming announcements
  // ---------------------------------------------------------------------------
  var liveRegion = null;
  try {
    liveRegion = document.createElement("div");
    liveRegion.className = "ca11y-live-region";
    liveRegion.setAttribute("role", "status");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    liveRegion.id = "ca11y-live";
    document.body.appendChild(liveRegion);
  } catch (e) {
    console.warn(LOG_PREFIX, "Could not create live region:", e.message);
  }

  function announce(text) {
    if (!liveRegion) return;
    try {
      liveRegion.textContent = "";
      setTimeout(function () {
        liveRegion.textContent = text;
      }, 100);
    } catch (e) {
      // Silently fail
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Template helper — replaces {key} placeholders in config strings
  // ---------------------------------------------------------------------------
  function tpl(template, vars) {
    var result = template;
    for (var key in vars) {
      if (vars.hasOwnProperty(key)) {
        result = result.replace(new RegExp("\\{" + key + "\\}", "g"), vars[key]);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // 4. Helper to safely create sr-only span
  // ---------------------------------------------------------------------------
  function createSrSpan(text, role) {
    var span = document.createElement("span");
    span.className = "ca11y-sr-only";
    span.setAttribute("aria-hidden", "false");
    if (role) span.setAttribute("role", role);
    span.textContent = text;
    return span;
  }

  // ---------------------------------------------------------------------------
  // 5. Upstream detection — skip transforms if the page already has proper
  //    accessibility attributes. Prevents double-annotation if Anthropic
  //    adds native ARIA support.
  // ---------------------------------------------------------------------------

  function hasUpstreamA11y(el) {
    if (!el) return false;
    var label = el.getAttribute("aria-label");
    if (label && /code block/i.test(label)) return true;
    if (el.getAttribute("role") === "region" && label && /response/i.test(label)) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // 6. Transformation functions
  // ---------------------------------------------------------------------------

  var transformCount = 0;

  function transformCodeBlocks(root) {
    var blocks = root.querySelectorAll("pre");
    for (var i = 0; i < blocks.length; i++) {
      var pre = blocks[i];
      if (pre.dataset.ca11y) continue;
      if (hasUpstreamA11y(pre)) { pre.dataset.ca11y = "1"; continue; }
      pre.dataset.ca11y = "1";
      transformCount++;

      var code = pre.querySelector("code");
      var lang = config.codeBlockDefault;

      if (code) {
        var match = code.className.match(/language-(\w+)/);
        if (match) {
          lang = match[1].charAt(0).toUpperCase() + match[1].slice(1);
        }
      }

      pre.setAttribute("role", "region");
      pre.setAttribute("aria-label", lang + " code block");
      pre.setAttribute("tabindex", "0");

      try {
        var startText = tpl(config.codeBlockStart, { lang: lang });
        var endText = tpl(config.codeBlockEnd, { lang: lang });
        pre.insertBefore(createSrSpan(startText, "note"), pre.firstChild);
        pre.appendChild(createSrSpan(endText, "note"));
      } catch (e) {
        console.warn(LOG_PREFIX, "Code block transform error:", e.message);
      }
    }
  }

  function transformInlineCode(root) {
    var codes = root.querySelectorAll("code:not(pre code)");
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i];
      if (code.dataset.ca11y) continue;
      code.dataset.ca11y = "1";
      transformCount++;

      code.removeAttribute("role");
      code.removeAttribute("aria-label");
    }
  }

  function transformHeadings(root) {
    var headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      if (h.dataset.ca11y) continue;
      h.dataset.ca11y = "1";
      transformCount++;

      var level = parseInt(h.tagName.charAt(1), 10);
      var prefix = level <= 2 ? config.headingPrefix : config.subheadingPrefix;

      try {
        h.insertBefore(createSrSpan(prefix + " "), h.firstChild);
      } catch (e) {
        console.warn(LOG_PREFIX, "Heading transform error:", e.message);
      }
    }
  }

  function transformTables(root) {
    var tables = root.querySelectorAll("table");
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      if (table.dataset.ca11y) continue;
      table.dataset.ca11y = "1";
      transformCount++;

      table.setAttribute("role", "table");
      table.setAttribute("tabindex", "0");

      var rows = table.querySelectorAll("tr");
      var cols = table.querySelector("tr")
        ? table.querySelector("tr").children.length
        : 0;

      try {
        var annText = tpl(config.tableStart, { rows: rows.length, cols: cols });
        table.setAttribute("aria-label", "Table, " + cols + " columns");
        var ann = createSrSpan(annText, "note");
        table.parentNode.insertBefore(ann, table);

        var headerRow = table.querySelector("thead tr, tr:first-child");
        var headerCells = headerRow ? Array.prototype.slice.call(headerRow.children) : [];
        var ths = table.querySelectorAll("th");
        for (var j = 0; j < ths.length; j++) {
          var isInHeaderRow = headerCells.indexOf(ths[j]) !== -1;
          ths[j].setAttribute("role", isInHeaderRow ? "columnheader" : "rowheader");
          ths[j].setAttribute("scope", isInHeaderRow ? "col" : "row");
        }

        var endAnn = createSrSpan(config.tableEnd, "note");
        table.parentNode.insertBefore(endAnn, table.nextSibling);
      } catch (e) {
        console.warn(LOG_PREFIX, "Table transform error:", e.message);
      }
    }
  }

  function transformBlockquotes(root) {
    var bqs = root.querySelectorAll("blockquote");
    for (var i = 0; i < bqs.length; i++) {
      var bq = bqs[i];
      if (bq.dataset.ca11y) continue;
      bq.dataset.ca11y = "1";
      transformCount++;

      bq.setAttribute("role", "note");
      try {
        bq.insertBefore(createSrSpan(config.quotePrefix + " "), bq.firstChild);
      } catch (e) {
        console.warn(LOG_PREFIX, "Blockquote transform error:", e.message);
      }
    }
  }

  function transformHorizontalRules(root) {
    var hrs = root.querySelectorAll("hr");
    for (var i = 0; i < hrs.length; i++) {
      var hr = hrs[i];
      if (hr.dataset.ca11y) continue;
      hr.dataset.ca11y = "1";
      transformCount++;

      hr.setAttribute("role", "separator");
      hr.setAttribute("aria-label", config.separatorLabel);
    }
  }

  function transformImages(root) {
    var imgs = root.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.dataset.ca11y) continue;
      img.dataset.ca11y = "1";
      transformCount++;

      if (!img.alt) img.alt = "Image";
      img.setAttribute("role", "img");
    }
  }

  function transformLinks(root) {
    var links = root.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.dataset.ca11y) continue;
      a.dataset.ca11y = "1";
      transformCount++;

      if (!a.textContent.trim()) {
        a.textContent = a.href;
      }
    }
  }

  function transformLists(root) {
    var lists = root.querySelectorAll("ul, ol");
    for (var i = 0; i < lists.length; i++) {
      var list = lists[i];
      if (list.dataset.ca11y) continue;
      list.dataset.ca11y = "1";
      transformCount++;

      list.setAttribute("role", "list");
      var items = list.querySelectorAll(":scope > li");
      for (var j = 0; j < items.length; j++) {
        items[j].setAttribute("role", "listitem");
      }
      var type = list.tagName === "OL" ? "numbered" : "bulleted";

      try {
        var annText = tpl(config.listAnnouncement, { count: items.length, type: type });
        var ann = createSrSpan(annText, "note");
        list.parentNode.insertBefore(ann, list);
      } catch (e) {
        console.warn(LOG_PREFIX, "List transform error:", e.message);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Global Raw/Accessible toggle — single button, toggles ALL annotations.
  //    Avoids polluting the tab order with per-response buttons.
  // ---------------------------------------------------------------------------

  var globalToggleBtn = null;

  function createGlobalToggle() {
    if (!config.showRawToggle) return;
    if (document.getElementById("ca11y-global-toggle")) return;

    try {
      globalToggleBtn = document.createElement("button");
      globalToggleBtn.id = "ca11y-global-toggle";
      globalToggleBtn.className = "ca11y-global-toggle";
      globalToggleBtn.textContent = "Raw";
      globalToggleBtn.setAttribute("aria-label", "Show raw output, hide accessibility annotations");
      globalToggleBtn.setAttribute("aria-pressed", "false");
      globalToggleBtn.setAttribute("type", "button");

      globalToggleBtn.addEventListener("click", function () {
        var isRaw = globalToggleBtn.getAttribute("aria-pressed") === "true";
        var srSpans = document.querySelectorAll(".ca11y-sr-only");

        if (!isRaw) {
          for (var i = 0; i < srSpans.length; i++) {
            srSpans[i].setAttribute("aria-hidden", "true");
            srSpans[i].style.display = "none";
          }
          globalToggleBtn.textContent = "Accessible";
          globalToggleBtn.setAttribute("aria-pressed", "true");
          globalToggleBtn.setAttribute("aria-label", "Show accessibility annotations, hide raw output");
          announce(phrasing.annotationsHidden || "Accessibility annotations hidden");
        } else {
          for (var j = 0; j < srSpans.length; j++) {
            srSpans[j].setAttribute("aria-hidden", "false");
            srSpans[j].style.display = "";
          }
          globalToggleBtn.textContent = "Raw";
          globalToggleBtn.setAttribute("aria-pressed", "false");
          globalToggleBtn.setAttribute("aria-label", "Show raw output, hide accessibility annotations");
          announce(phrasing.annotationsRestored || "Accessibility annotations restored");
        }
      });

      document.body.appendChild(globalToggleBtn);
    } catch (e) {
      // Toggle is non-critical
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Site adapters — per-site selectors for message containers, input area,
  //    generation status, and page detection. Core transforms are site-agnostic;
  //    adapters tell the engine where to find chat-specific UI elements.
  // ---------------------------------------------------------------------------

  var siteAdapters = [
    {
      name: "claude",
      match: function (host) { return host.indexOf("claude.ai") !== -1; },
      messageSelectors: [
        '[data-testid="chat-message-content"]',
        '[data-testid="conversation-turn"]',
        '[class*="font-claude"]',
        ".prose",
        '[class*="ConversationItem"]',
      ],
      inputSelectors: [
        'div[contenteditable="true"][data-placeholder]',
        'div[contenteditable="true"][role="textbox"]',
        "textarea[placeholder]",
      ],
      stopSelectors: [
        '[data-testid="stop-button"]',
        'button[aria-label*="top"]',
        'button[aria-label*="Cancel"]',
      ],
      titleSelectors: [
        '[data-testid="conversation-title"]',
        'nav a[aria-current="page"]',
      ],
    },
    {
      name: "chatgpt",
      match: function (host) {
        return host.indexOf("chatgpt.com") !== -1 || host.indexOf("chat.openai.com") !== -1;
      },
      messageSelectors: [
        '[data-message-author-role="assistant"]',
        'div[class*="agent-turn"]',
        'div[class*="markdown"]',
        ".prose",
      ],
      inputSelectors: [
        "#prompt-textarea",
        'textarea[data-id="root"]',
        'div[contenteditable="true"]',
      ],
      stopSelectors: [
        'button[aria-label="Stop generating"]',
        'button[data-testid="stop-button"]',
      ],
      titleSelectors: [
        'nav a[class*="active"]',
      ],
    },
    {
      name: "gemini",
      match: function (host) { return host.indexOf("gemini.google.com") !== -1; },
      messageSelectors: [
        "model-response",
        'div[class*="response-container"]',
        ".markdown",
        'message-content[class*="model"]',
      ],
      inputSelectors: [
        'rich-textarea textarea',
        'div[contenteditable="true"]',
        '.text-input-field textarea',
      ],
      stopSelectors: [
        'button[aria-label="Stop response"]',
        'button[aria-label="Stop"]',
      ],
      titleSelectors: [],
    },
    {
      name: "copilot",
      match: function (host) {
        return host.indexOf("copilot.microsoft.com") !== -1;
      },
      messageSelectors: [
        'cib-message-group[source="bot"]',
        '[class*="response"]',
        ".ac-adaptiveCard",
      ],
      inputSelectors: [
        "#searchbox",
        'textarea[aria-label]',
      ],
      stopSelectors: [
        'button[aria-label="Stop Responding"]',
      ],
      titleSelectors: [],
    },
    {
      name: "cursor",
      match: function () {
        try {
          if (typeof acquireVsCodeApi === "function") return true;
          if (document.querySelector(".monaco-workbench")) return true;
        } catch (e) { /* not Cursor */ }
        return false;
      },
      messageSelectors: [
        '[class*="agentTurn"]',
        '[class*="chat-response"]',
        '[class*="assistantMessage"]',
        '[class*="response-container"]',
        '[class*="aiMessage"]',
        '[class*="message-content"]',
        ".interactive-item-container",
        ".interactive-result-editor-wrapper",
        ".chat-tree-container",
        ".rendered-markdown",
        ".markdown-body",
      ],
      inputSelectors: [
        'textarea[placeholder]',
      ],
      stopSelectors: [
        'button[aria-label*="Cancel"]',
      ],
      titleSelectors: [],
    },
  ];

  var activeAdapter = null;

  function detectAdapter() {
    if (activeAdapter) return activeAdapter;
    var host = "";
    try { host = window.location.hostname; } catch (e) { /* no host */ }

    for (var i = 0; i < siteAdapters.length; i++) {
      try {
        if (siteAdapters[i].match(host)) {
          activeAdapter = siteAdapters[i];
          debugLog(LOG_PREFIX, "Site adapter:", activeAdapter.name);
          return activeAdapter;
        }
      } catch (e) { /* skip */ }
    }
    return null;
  }

  function getAllMessageSelectors() {
    var adapter = detectAdapter();
    if (adapter) return adapter.messageSelectors;
    var all = [];
    for (var i = 0; i < siteAdapters.length; i++) {
      all = all.concat(siteAdapters[i].messageSelectors);
    }
    return all;
  }

  // ---------------------------------------------------------------------------
  // 7b. Mark chat response containers with ARIA landmarks
  // ---------------------------------------------------------------------------

  function transformChatMessages(root) {
    var selectors = getAllMessageSelectors();

    for (var s = 0; s < selectors.length; s++) {
      try {
        var messages = root.querySelectorAll(selectors[s]);
        for (var i = 0; i < messages.length; i++) {
          var msg = messages[i];
          if (msg.dataset.ca11yMsg) continue;
          if (hasUpstreamA11y(msg)) { msg.dataset.ca11yMsg = "1"; continue; }
          msg.dataset.ca11yMsg = "1";

          msg.setAttribute("role", "region");
          msg.setAttribute("aria-label", config.responseLabel);

          processElement(msg);
        }
      } catch (e) {
        // Selector may not be valid, skip it
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Heuristic fallback — if no known selectors match, find containers
  //    that hold rendered markdown by checking for structural child elements.
  // ---------------------------------------------------------------------------

  function isLikelyChatPage() {
    if (detectAdapter()) return true;
    try {
      var host = window.location.hostname;
      if (host.indexOf("claude.ai") !== -1) return true;
      if (host.indexOf("chatgpt.com") !== -1) return true;
      if (host.indexOf("chat.openai.com") !== -1) return true;
      if (host.indexOf("gemini.google.com") !== -1) return true;
      if (host.indexOf("copilot.microsoft.com") !== -1) return true;
      if (typeof acquireVsCodeApi === "function") return true;
      if (document.querySelector(".monaco-workbench")) return true;
    } catch (e) {
      // Silently continue
    }
    return false;
  }

  function heuristicScan() {
    if (!isLikelyChatPage()) return 0;

    var found = 0;
    try {
      var allPre = document.querySelectorAll("pre");
      for (var i = 0; i < allPre.length; i++) {
        var container = allPre[i].parentElement;
        if (!container || container.dataset.ca11yMsg) continue;
        if (hasUpstreamA11y(container)) continue;

        var hasMd = container.querySelector("p") &&
          (container.querySelector("pre") || container.querySelector("h1, h2, h3, h4, h5, h6") || container.querySelector("ul, ol"));

        if (hasMd) {
          container.dataset.ca11yMsg = "1";
          container.setAttribute("role", "region");
          container.setAttribute("aria-label", config.responseLabel);
          processElement(container);
          found++;
        }
      }
    } catch (e) {
      // Heuristic is best-effort
    }
    return found;
  }

  // ---------------------------------------------------------------------------
  // 9. Process a container that has rendered markdown
  // ---------------------------------------------------------------------------

  function processElement(el) {
    if (!el || !el.querySelectorAll) return;
    if (!config.enabled) return;

    try {
      transformCodeBlocks(el);
      transformInlineCode(el);
      transformHeadings(el);
      transformTables(el);
      transformBlockquotes(el);
      transformHorizontalRules(el);
      transformImages(el);
      transformLinks(el);
      transformLists(el);
    } catch (e) {
      console.warn(LOG_PREFIX, "Error processing element:", e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 10. Selectors for chat content areas across apps — with selector
  //     validation. Each selector is tested individually. Invalid or
  //     zero-match selectors are logged once so stale selectors are visible.
  // ---------------------------------------------------------------------------

  var SELECTOR_VERSION = 3;

  function buildSelectorList() {
    var selectors = getAllMessageSelectors();
    var unique = [];
    var seen = {};
    for (var i = 0; i < selectors.length; i++) {
      if (!seen[selectors[i]]) {
        seen[selectors[i]] = true;
        unique.push(selectors[i]);
      }
    }
    return unique;
  }

  var CHAT_SELECTOR_LIST = buildSelectorList();

  var selectorMatchCounts = {};

  function buildValidSelectors() {
    var valid = [];
    for (var i = 0; i < CHAT_SELECTOR_LIST.length; i++) {
      try {
        document.querySelectorAll(CHAT_SELECTOR_LIST[i]);
        valid.push(CHAT_SELECTOR_LIST[i]);
      } catch (e) {
        console.warn(LOG_PREFIX, "Invalid selector skipped:", CHAT_SELECTOR_LIST[i]);
      }
    }
    return valid.join(", ");
  }

  var CHAT_SELECTORS = buildValidSelectors();

  // ---------------------------------------------------------------------------
  // 11. Selector health check — warn if no containers found, and track
  //     which selectors actually matched so stale ones are identifiable.
  // ---------------------------------------------------------------------------

  var selectorHealthLogged = false;
  var selectorHealthWarning = false;
  var fallbackActive = false;

  function checkSelectorHealth() {
    if (selectorHealthLogged) return;

    var anyMatched = false;
    for (var i = 0; i < CHAT_SELECTOR_LIST.length; i++) {
      try {
        var count = document.querySelectorAll(CHAT_SELECTOR_LIST[i]).length;
        selectorMatchCounts[CHAT_SELECTOR_LIST[i]] = count;
        if (count > 0) anyMatched = true;
      } catch (e) {
        selectorMatchCounts[CHAT_SELECTOR_LIST[i]] = -1;
      }
    }

    if (!anyMatched && transformCount === 0) {
      console.warn(
        LOG_PREFIX,
        "Selector version " + SELECTOR_VERSION + ": no chat containers found. Trying heuristic fallback."
      );
      var heuristicFound = heuristicScan();
      if (heuristicFound === 0) {
        console.warn(
          LOG_PREFIX,
          "Heuristic fallback found no containers either (selector v" + SELECTOR_VERSION + "). " +
          "File an issue at https://github.com/JacquelineDMcGraw/claude-a11y/issues"
        );
        selectorHealthWarning = true;
        if (liveRegion) {
          announce(
            "Claude A11y: could not detect chat messages. " +
            "Selector version " + SELECTOR_VERSION + ". " +
            "The page structure may have changed."
          );
        }
      } else {
        debugLog(LOG_PREFIX, "Heuristic fallback active — found", heuristicFound, "containers.");
        fallbackActive = true;
        if (liveRegion) {
          announce(
            "Claude A11y: using fallback detection. Some features may not work."
          );
        }
      }
      selectorHealthLogged = true;
    }
  }

  // ---------------------------------------------------------------------------
  // 12. Scan existing content
  // ---------------------------------------------------------------------------

  function scanAll() {
    if (!config.enabled) return;

    var beforeCount = transformCount;

    try {
      var containers = document.querySelectorAll(CHAT_SELECTORS);
      for (var i = 0; i < containers.length; i++) {
        processElement(containers[i]);
      }
    } catch (e) {
      console.warn(LOG_PREFIX, "Selector scan error:", e.message);
    }

    try {
      var elements = document.querySelectorAll(
        "pre, table, blockquote, h1, h2, h3, h4, h5, h6, ul, ol"
      );
      for (i = 0; i < elements.length; i++) {
        processElement(elements[i].parentElement || elements[i]);
      }
    } catch (e) {
      // Silently continue
    }

    try {
      transformChatMessages(document.body);
    } catch (e) {
      // Silently continue
    }

    var newTransforms = transformCount - beforeCount;
    if (newTransforms > 0) {
      debugLog(
        LOG_PREFIX,
        "Scan complete. Transformed",
        newTransforms,
        "new elements (" + transformCount + " total)."
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 13. MutationObserver — watch for new DOM nodes
  // ---------------------------------------------------------------------------

  var pendingScan = null;
  var scanQueued = false;

  function scheduleScan() {
    if (scanQueued) return;
    scanQueued = true;
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        scanQueued = false;
        if (pendingScan) return;
        pendingScan = setTimeout(function () {
          pendingScan = null;
          scanAll();
        }, 150);
      });
    } else {
      scanQueued = false;
      if (!pendingScan) {
        pendingScan = setTimeout(function () {
          pendingScan = null;
          scanAll();
        }, 200);
      }
    }
  }

  var observer = new MutationObserver(function () {
    if (!config.enabled) return;
    scheduleScan();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // ---------------------------------------------------------------------------
  // 14. Smart rescan strategy
  // ---------------------------------------------------------------------------

  setTimeout(function () { scanAll(); }, 1000);
  setTimeout(function () { scanAll(); }, 3000);
  setTimeout(function () { scanAll(); }, 5000);
  setTimeout(function () {
    scanAll();
    checkSelectorHealth();
  }, 10000);

  var fallbackIdleCycles = 0;
  var fallbackMaxIdle = 20;
  var fallbackInterval = setInterval(function () {
    var before = transformCount;
    scanAll();
    if (transformCount === before) {
      fallbackIdleCycles++;
      if (fallbackIdleCycles >= fallbackMaxIdle) {
        clearInterval(fallbackInterval);
        debugLog(
          LOG_PREFIX,
          "Fallback rescan disabled after",
          fallbackMaxIdle,
          "idle cycles. MutationObserver is handling updates."
        );
      }
    } else {
      fallbackIdleCycles = 0;
    }
  }, 30000);

  // ---------------------------------------------------------------------------
  // 15. Input-side accessibility — focus management, generation status,
  //     keyboard navigation between turns, conversation title.
  // ---------------------------------------------------------------------------

  var inputTransformed = false;

  function transformInputArea() {
    if (inputTransformed) return;

    var adapter = detectAdapter();
    var inputSels = adapter ? adapter.inputSelectors : [
      'textarea[placeholder]',
      '[contenteditable="true"][data-placeholder]',
      'div[contenteditable="true"][role="textbox"]',
    ];

    for (var s = 0; s < inputSels.length; s++) {
      try {
        var input = document.querySelector(inputSels[s]);
        if (input) {
          if (!input.getAttribute("aria-label")) {
            input.setAttribute("aria-label", "Message input");
          }
          if (!input.getAttribute("role") && input.tagName !== "TEXTAREA") {
            input.setAttribute("role", "textbox");
          }
          input.setAttribute("aria-multiline", "true");
          inputTransformed = true;
          return;
        }
      } catch (e) { /* skip invalid selector */ }
    }
  }

  function observeGenerationStatus() {
    var adapter = detectAdapter();
    var stopSels = adapter ? adapter.stopSelectors : [
      '[data-testid="stop-button"]',
      'button[aria-label*="top"]',
      'button[aria-label*="Cancel"]',
    ];
    var isGenerating = false;
    var statusChecked = false;

    var statusObserver = new MutationObserver(function () {
      var found = false;
      for (var i = 0; i < stopSels.length; i++) {
        try {
          if (document.querySelector(stopSels[i])) {
            found = true;
            break;
          }
        } catch (e) { /* skip */ }
      }

      if (found && !isGenerating) {
        isGenerating = true;
        statusChecked = true;
        var lastResponse = document.querySelector("[data-ca11y-msg]:last-of-type") ||
          Array.prototype.slice.call(document.querySelectorAll("[data-ca11y-msg]")).pop();
        if (lastResponse) lastResponse.setAttribute("aria-busy", "true");
        announce(phrasing.generatingStatus || "Generating response...");
      } else if (!found && isGenerating) {
        isGenerating = false;
        var busyEls = document.querySelectorAll("[data-ca11y-msg][aria-busy]");
        for (var b = 0; b < busyEls.length; b++) {
          busyEls[b].setAttribute("aria-busy", "false");
        }
        announce(phrasing.responseComplete || "Response complete.");
      }
    });

    statusObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-label", "disabled"],
    });

    setTimeout(function () {
      if (!statusChecked) {
        debugLog(
          LOG_PREFIX,
          "Generation status detection: no stop-button selectors matched yet. " +
          "Generating/complete announcements may not fire on this page."
        );
      }
    }, 30000);

    return statusObserver;
  }

  function addResponseNavigation() {
    document.addEventListener("keydown", function (e) {
      // Alt+ArrowUp / Alt+ArrowDown to navigate between response regions
      if (!e.altKey) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      var regions = document.querySelectorAll("[data-ca11y-msg]");
      if (regions.length === 0) return;

      e.preventDefault();
      var active = document.activeElement;
      var currentIndex = -1;

      for (var i = 0; i < regions.length; i++) {
        if (regions[i].contains(active) || regions[i] === active) {
          currentIndex = i;
          break;
        }
      }

      var nextIndex;
      if (e.key === "ArrowDown") {
        nextIndex = currentIndex < regions.length - 1 ? currentIndex + 1 : regions.length - 1;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      }

      var target = regions[nextIndex];
      if (target) {
        for (var c = 0; c < regions.length; c++) {
          regions[c].removeAttribute("aria-current");
        }
        target.setAttribute("aria-current", "true");
        target.setAttribute("tabindex", "-1");
        target.focus();
        announce("Response " + (nextIndex + 1) + " of " + regions.length);
      }
    });
  }

  function labelResponses() {
    var regions = document.querySelectorAll("[data-ca11y-msg]");
    for (var i = 0; i < regions.length; i++) {
      var existing = regions[i].getAttribute("aria-label") || "";
      // Strip any previous "Response N" or ", Response N" suffix before renumbering
      var base = existing.replace(/,?\s*Response \d+(\s+of\s+\d+)?/g, "").trim();
      if (base) {
        regions[i].setAttribute("aria-label", base + ", Response " + (i + 1));
      } else {
        regions[i].setAttribute("aria-label", "Response " + (i + 1));
      }
    }
  }

  function readConversationTitle() {
    var adapter = detectAdapter();
    var titleSels = adapter && adapter.titleSelectors ? adapter.titleSelectors : [
      '[data-testid="conversation-title"]',
      'h1[class*="conversation"]',
      'nav a[aria-current="page"]',
    ];

    for (var s = 0; s < titleSels.length; s++) {
      try {
        var titleEl = document.querySelector(titleSels[s]);
        if (titleEl && titleEl.textContent) {
          var mainChat = document.querySelector("main") || document.querySelector('[role="main"]');
          if (mainChat && !mainChat.getAttribute("aria-label")) {
            mainChat.setAttribute("aria-label", "Chat: " + titleEl.textContent.trim());
          }
          return;
        }
      } catch (e) { /* skip */ }
    }
  }

  // Wire input-side transforms into the scan cycle
  var origScanAll = scanAll;
  scanAll = function () {
    origScanAll();
    transformInputArea();
    labelResponses();
    readConversationTitle();
    createGlobalToggle();
  };

  var statusObserverRef = null;
  try { statusObserverRef = observeGenerationStatus(); } catch (e) { /* non-critical */ }

  // Install keyboard navigation
  try { addResponseNavigation(); } catch (e) { /* non-critical */ }

  // ---------------------------------------------------------------------------
  // 16. Public API — exposed globally for debugging and runtime configuration
  // ---------------------------------------------------------------------------
  window.__ca11yScan = scanAll;

  window.__ca11yStats = function () {
    return {
      transformCount: transformCount,
      hasTrustedTypes: !!policy,
      hasLiveRegion: !!liveRegion,
      observerActive: true,
      fallbackActive: fallbackActive,
      selectorHealthWarning: selectorHealthWarning,
      selectorVersion: SELECTOR_VERSION,
      selectorMatchCounts: selectorMatchCounts,
      siteAdapter: activeAdapter ? activeAdapter.name : "none",
      config: config,
    };
  };

  window.__ca11yAdapters = siteAdapters;

  window.__ca11ySetConfig = function (overrides) {
    for (var key in overrides) {
      if (overrides.hasOwnProperty(key) && defaultConfig.hasOwnProperty(key)) {
        config[key] = overrides[key];
      }
    }
    debugLog(LOG_PREFIX, "Config updated. Run __ca11yScan() to re-apply.");
    return config;
  };

  window.__ca11yDisable = function () {
    config.enabled = false;
    if (statusObserverRef) { statusObserverRef.disconnect(); }
    debugLog(LOG_PREFIX, "Transforms disabled. New content will not be processed.");
  };

  window.__ca11yEnable = function () {
    config.enabled = true;
    scanAll();
    debugLog(LOG_PREFIX, "Transforms re-enabled.");
  };

  debugLog(LOG_PREFIX, "Chat accessibility layer active.");
  debugLog(
    LOG_PREFIX,
    "API: __ca11yScan() rescan, __ca11yStats() stats, " +
    "__ca11ySetConfig({key:val}) customize, __ca11yDisable()/__ca11yEnable() toggle."
  );
})();
