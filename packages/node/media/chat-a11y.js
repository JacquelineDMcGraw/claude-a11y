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

  var LOG_PREFIX = "[claude-accessible]";

  // ---------------------------------------------------------------------------
  // 0. Configuration — user-overridable announcement phrasing and behavior.
  //    Override via window.__ca11yConfig before this script loads, or call
  //    __ca11yConfig() at runtime. Every key has a sensible default.
  // ---------------------------------------------------------------------------
  // Import canonical phrasing if available (loaded via phrasing.js on window)
  var phrasing = (typeof window.__ca11yPhrasing === "object" && window.__ca11yPhrasing) || {};

  var defaultConfig = {
    enabled: true,
    verbosity: "normal",
    showRawToggle: true,
    codeBlockStart: phrasing.codeBlockStart || "[{lang}]",
    codeBlockEnd: phrasing.codeBlockEnd || "[End {lang}]",
    codeBlockDefault: phrasing.codeBlockDefault || "Code",
    headingPrefix: phrasing.headingPrefix || "[Heading]",
    subheadingPrefix: phrasing.subheadingPrefix || "[Subheading]",
    quotePrefix: phrasing.quotePrefix || "[Quote]",
    tableStart: phrasing.tableStart || "[Table, {cols} columns]",
    tableEnd: phrasing.tableEnd || "[End Table]",
    tableHeader: phrasing.tableHeader || "[Header]",
    tableRow: phrasing.tableRow || "[Row {n}]",
    listAnnouncement: phrasing.listAnnouncement || "[{count} item {type} list]",
    bulletPrefix: phrasing.bulletPrefix || "Bullet:",
    separatorLabel: phrasing.separator || "[Separator]",
    imageLabel: phrasing.imageLabel || "[Image: {alt}]",
    imageLabelNoAlt: phrasing.imageLabelNoAlt || "[Image]",
    strikethroughStart: phrasing.strikethroughStart || "[Strikethrough]",
    strikethroughEnd: phrasing.strikethroughEnd || "[End Strikethrough]",
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
      policy = window.trustedTypes.createPolicy("claudeAccessible", {
        createHTML: function (s) { return s; },
        createScript: function (s) { return s; },
        createScriptURL: function (s) { return s; },
      });
      console.log(LOG_PREFIX, "TrustedTypes policy created.");
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
      ".ca11y-raw-toggle {",
      "  position: absolute;",
      "  top: 4px;",
      "  right: 4px;",
      "  padding: 2px 6px;",
      "  font-size: 11px;",
      "  background: transparent;",
      "  border: 1px solid currentColor;",
      "  border-radius: 3px;",
      "  cursor: pointer;",
      "  opacity: 0.01;",
      "  z-index: 10;",
      "  transition: opacity 0.15s;",
      "}",
      ".ca11y-raw-toggle:focus, .ca11y-raw-toggle:focus-visible,",
      "[data-ca11y-msg]:hover .ca11y-raw-toggle {",
      "  opacity: 1;",
      "}",
    ].join("\n");
    document.head.appendChild(style);
    console.log(LOG_PREFIX, "Injected sr-only CSS.");
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

      pre.setAttribute("aria-label", lang + " code block");

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

      code.setAttribute("role", "text");
      code.setAttribute("aria-label", code.textContent);
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

      var rows = table.querySelectorAll("tr");
      var cols = table.querySelector("tr")
        ? table.querySelector("tr").children.length
        : 0;

      try {
        var annText = tpl(config.tableStart, { rows: rows.length, cols: cols });
        var ann = createSrSpan(annText, "note");
        table.parentNode.insertBefore(ann, table);

        var ths = table.querySelectorAll("th");
        for (var j = 0; j < ths.length; j++) {
          ths[j].setAttribute("role", "columnheader");
          ths[j].setAttribute("scope", "col");
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

      var items = list.querySelectorAll(":scope > li");
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
  // 6. Raw markdown toggle — escape hatch for per-message bypass.
  //    Stores original innerHTML before transforms so users can switch
  //    between accessible view and raw markdown.
  // ---------------------------------------------------------------------------

  function addRawToggle(container) {
    if (!config.showRawToggle) return;
    if (container.querySelector(".ca11y-raw-toggle")) return;

    try {
      var pos = container.style.position;
      if (!pos || pos === "static") {
        container.style.position = "relative";
      }

      var btn = document.createElement("button");
      btn.className = "ca11y-raw-toggle";
      btn.textContent = "Raw";
      btn.setAttribute("aria-label", "Show raw markdown, hide accessibility annotations");
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("type", "button");

      btn.addEventListener("click", function () {
        var isRaw = btn.getAttribute("aria-pressed") === "true";
        var srSpans = container.querySelectorAll(".ca11y-sr-only");
        if (!isRaw) {
          for (var i = 0; i < srSpans.length; i++) {
            srSpans[i].setAttribute("aria-hidden", "true");
            srSpans[i].style.display = "none";
          }
          btn.textContent = "Accessible";
          btn.setAttribute("aria-pressed", "true");
          btn.setAttribute("aria-label", "Show accessibility annotations, hide raw view");
          announce("Accessibility annotations hidden for this response");
        } else {
          for (var i = 0; i < srSpans.length; i++) {
            srSpans[i].setAttribute("aria-hidden", "false");
            srSpans[i].style.display = "";
          }
          btn.textContent = "Raw";
          btn.setAttribute("aria-pressed", "false");
          btn.setAttribute("aria-label", "Show raw markdown, hide accessibility annotations");
          announce("Accessibility annotations restored for this response");
        }
      });

      container.insertBefore(btn, container.firstChild);
    } catch (e) {
      // Toggle is non-critical
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Mark chat response containers with ARIA landmarks
  //    Only response containers get role="region" to keep the landmark
  //    list useful for navigation. Individual elements inside (code blocks,
  //    tables, etc.) use aria-label without a landmark role.
  // ---------------------------------------------------------------------------

  function transformChatMessages(root) {
    var messageSelectors = [
      // Claude.ai / Claude Desktop — stable selectors first
      '[data-testid="chat-message-content"]',
      '[data-testid="conversation-turn"]',
      // Claude.ai class-based (may change between deploys)
      '[class*="font-claude"]',
      ".prose",
      '[class*="ConversationItem"]',
      // Cursor AI chat
      '[class*="agentTurn"]',
      '[class*="chat-response"]',
      '[class*="assistantMessage"]',
      '[class*="response-container"]',
      '[class*="aiMessage"]',
      '[class*="message-content"]',
      ".interactive-item-container",
    ];

    for (var s = 0; s < messageSelectors.length; s++) {
      try {
        var messages = root.querySelectorAll(messageSelectors[s]);
        for (var i = 0; i < messages.length; i++) {
          var msg = messages[i];
          if (msg.dataset.ca11yMsg) continue;
          if (hasUpstreamA11y(msg)) { msg.dataset.ca11yMsg = "1"; continue; }
          msg.dataset.ca11yMsg = "1";

          msg.setAttribute("role", "region");
          msg.setAttribute("aria-label", config.responseLabel);

          processElement(msg);
          addRawToggle(msg);
        }
      } catch (e) {
        // Selector may not be valid, skip it
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Heuristic fallback — if no known selectors match, find containers
  //    that hold rendered markdown by checking for structural child elements.
  //    This handles the case where Anthropic changes class names.
  // ---------------------------------------------------------------------------

  var CHAT_PAGE_SIGNALS = [
    "claude.ai",
    "chat.openai.com",
    "chatgpt.com",
  ];

  function isLikelyChatPage() {
    try {
      var host = window.location.hostname;
      for (var i = 0; i < CHAT_PAGE_SIGNALS.length; i++) {
        if (host.indexOf(CHAT_PAGE_SIGNALS[i]) !== -1) return true;
      }
      // Inside Cursor/VS Code webview — no hostname, but has vscode API
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
          addRawToggle(container);
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

  var SELECTOR_VERSION = 2;

  var CHAT_SELECTOR_LIST = [
    // Claude.ai / Claude Desktop — data-testid preferred (most stable)
    '[data-testid="chat-message-content"]',
    '[data-testid="conversation-turn"]',
    // Claude.ai — structural (no substring class matches)
    ".prose",
    // Cursor AI chat
    '[class*="agentTurn"]',
    '[class*="chat-message"]',
    // VS Code chat / Copilot
    ".interactive-result-editor-wrapper",
    ".chat-tree-container",
    ".rendered-markdown",
    ".markdown-body",
  ];

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
            "Claude Accessible: could not detect chat messages. " +
            "Selector version " + SELECTOR_VERSION + ". " +
            "The page structure may have changed."
          );
        }
      } else {
        console.log(LOG_PREFIX, "Heuristic fallback active — found", heuristicFound, "containers.");
        fallbackActive = true;
        if (liveRegion) {
          announce(
            "Claude Accessible: using fallback detection. Some features may not work."
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
      for (var i = 0; i < elements.length; i++) {
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
      console.log(
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

  function debouncedScan() {
    if (pendingScan) return;
    pendingScan = setTimeout(function () {
      pendingScan = null;
      scanAll();
    }, 300);
  }

  var observer = new MutationObserver(function (mutations) {
    if (!config.enabled) return;
    var shouldScan = false;

    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];

      for (var j = 0; j < mutation.addedNodes.length; j++) {
        var node = mutation.addedNodes[j];
        if (node.nodeType === Node.ELEMENT_NODE) {
          processElement(node);
          transformChatMessages(node);
          shouldScan = true;
        }
      }

      if (mutation.type === "characterData") {
        shouldScan = true;
      }
    }

    if (shouldScan) {
      debouncedScan();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // ---------------------------------------------------------------------------
  // 14. Smart rescan strategy
  // ---------------------------------------------------------------------------

  setTimeout(scanAll, 1000);
  setTimeout(scanAll, 3000);
  setTimeout(scanAll, 5000);
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
        console.log(
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

  var responseCounter = 0;
  var inputTransformed = false;

  function transformInputArea() {
    if (inputTransformed) return;

    // Find the chat input (textarea or contenteditable)
    var input = document.querySelector(
      'textarea[placeholder], [contenteditable="true"][data-placeholder], ' +
      'div[contenteditable="true"][role="textbox"]'
    );
    if (input) {
      if (!input.getAttribute("aria-label")) {
        input.setAttribute("aria-label", "Message input");
      }
      if (!input.getAttribute("role") && input.tagName !== "TEXTAREA") {
        input.setAttribute("role", "textbox");
      }
      inputTransformed = true;
    }
  }

  function observeGenerationStatus() {
    var stopSelectors = [
      '[data-testid="stop-button"]',
      'button[aria-label*="top"]',
      'button[aria-label*="Cancel"]',
    ];
    var isGenerating = false;
    var statusChecked = false;

    var statusObserver = new MutationObserver(function () {
      var found = false;
      for (var i = 0; i < stopSelectors.length; i++) {
        try {
          if (document.querySelector(stopSelectors[i])) {
            found = true;
            break;
          }
        } catch (e) { /* skip */ }
      }

      if (found && !isGenerating) {
        isGenerating = true;
        statusChecked = true;
        announce("Generating response...");
      } else if (!found && isGenerating) {
        isGenerating = false;
        announce("Response complete.");
      }
    });

    statusObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-label", "disabled"],
    });

    // Health check: if after 30s we never detected a generation cycle,
    // log it so it's diagnosable. Don't announce — not a user-facing error.
    setTimeout(function () {
      if (!statusChecked) {
        console.log(
          LOG_PREFIX,
          "Generation status detection: no stop-button selectors matched yet. " +
          "Generating/complete announcements may not fire on this page."
        );
      }
    }, 30000);
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
    var titleEl = document.querySelector(
      '[data-testid="conversation-title"], ' +
      'h1[class*="conversation"], ' +
      'nav a[aria-current="page"]'
    );
    if (titleEl && titleEl.textContent) {
      var mainChat = document.querySelector("main") || document.querySelector('[role="main"]');
      if (mainChat && !mainChat.getAttribute("aria-label")) {
        mainChat.setAttribute("aria-label", "Chat: " + titleEl.textContent.trim());
      }
    }
  }

  // Wire input-side transforms into the scan cycle
  var origScanAll = scanAll;
  scanAll = function () {
    origScanAll();
    transformInputArea();
    labelResponses();
    readConversationTitle();
  };

  // Start generation status observation
  try { observeGenerationStatus(); } catch (e) { /* non-critical */ }

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
      config: config,
    };
  };

  window.__ca11ySetConfig = function (overrides) {
    for (var key in overrides) {
      if (overrides.hasOwnProperty(key) && defaultConfig.hasOwnProperty(key)) {
        config[key] = overrides[key];
      }
    }
    console.log(LOG_PREFIX, "Config updated. Run __ca11yScan() to re-apply.");
    return config;
  };

  window.__ca11yDisable = function () {
    config.enabled = false;
    console.log(LOG_PREFIX, "Transforms disabled. New content will not be processed.");
  };

  window.__ca11yEnable = function () {
    config.enabled = true;
    scanAll();
    console.log(LOG_PREFIX, "Transforms re-enabled.");
  };

  console.log(LOG_PREFIX, "Chat accessibility layer active.");
  console.log(
    LOG_PREFIX,
    "API: __ca11yScan() rescan, __ca11yStats() stats, " +
    "__ca11ySetConfig({key:val}) customize, __ca11yDisable()/__ca11yEnable() toggle."
  );
})();
