/**
 * chat-a11y.js — DOM injection script for Cursor/VS Code chat accessibility.
 *
 * Runs inside the Electron renderer via workbench.html patch.
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
  // 0. TrustedTypes policy (required by Cursor's strict CSP)
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
      "}",
      ".ca11y-live-region {",
      "  position: absolute !important;",
      "  width: 1px !important;",
      "  height: 1px !important;",
      "  overflow: hidden !important;",
      "  clip: rect(0, 0, 0, 0) !important;",
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
      // Brief delay so screen reader picks up the change
      setTimeout(function () {
        liveRegion.textContent = text;
      }, 100);
    } catch (e) {
      // Silently fail
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Helper to safely create sr-only span
  // ---------------------------------------------------------------------------
  function createSrSpan(text, role) {
    var span = document.createElement("span");
    span.className = "ca11y-sr-only";
    if (role) span.setAttribute("role", role);
    span.textContent = text;
    return span;
  }

  // ---------------------------------------------------------------------------
  // 4. Transformation functions
  // ---------------------------------------------------------------------------

  var transformCount = 0;

  function transformCodeBlocks(root) {
    var blocks = root.querySelectorAll("pre");
    for (var i = 0; i < blocks.length; i++) {
      var pre = blocks[i];
      if (pre.dataset.ca11y) continue;
      pre.dataset.ca11y = "1";
      transformCount++;

      var code = pre.querySelector("code");
      var lang = "Code";

      if (code) {
        var match = code.className.match(/language-(\w+)/);
        if (match) {
          lang = match[1].charAt(0).toUpperCase() + match[1].slice(1);
        }
      }

      pre.setAttribute("role", "region");
      pre.setAttribute("aria-label", lang + " code block");

      try {
        pre.insertBefore(createSrSpan("[" + lang + "]", "note"), pre.firstChild);
        pre.appendChild(createSrSpan("[End " + lang + "]", "note"));
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
      var prefix = level <= 2 ? "Heading" : "Subheading";

      try {
        h.insertBefore(createSrSpan("[" + prefix + "] "), h.firstChild);
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
        var ann = createSrSpan(
          "[Table: " + rows.length + " rows, " + cols + " columns]",
          "note"
        );
        table.parentNode.insertBefore(ann, table);

        table.querySelectorAll("th").forEach(function (th) {
          th.setAttribute("role", "columnheader");
          th.setAttribute("scope", "col");
        });

        var endAnn = createSrSpan("[End Table]", "note");
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
        bq.insertBefore(createSrSpan("[Quote] "), bq.firstChild);
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
      hr.setAttribute("aria-label", "Section separator");
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
        var ann = createSrSpan(
          "[" + items.length + " item " + type + " list]",
          "note"
        );
        list.parentNode.insertBefore(ann, list);
      } catch (e) {
        console.warn(LOG_PREFIX, "List transform error:", e.message);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Mark chat response containers with ARIA landmarks
  // ---------------------------------------------------------------------------

  function transformChatMessages(root) {
    // Cursor renders AI responses in divs with specific classes
    // Try multiple selector patterns
    var messageSelectors = [
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
          msg.dataset.ca11yMsg = "1";

          msg.setAttribute("role", "article");
          msg.setAttribute("aria-label", "AI response");

          // Process the markdown inside
          processElement(msg);
        }
      } catch (e) {
        // Selector may not be valid, skip it
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Process a container that has rendered markdown
  // ---------------------------------------------------------------------------

  function processElement(el) {
    if (!el || !el.querySelectorAll) return;

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
  // 7. Selectors for chat content areas in VS Code / Cursor
  // ---------------------------------------------------------------------------

  var CHAT_SELECTORS = [
    // Cursor AI chat
    '[class*="agentTurn"]',
    '[class*="markdown"]',
    '[class*="chat-message"]',
    '[class*="response"]',
    '[class*="Message"]',
    // VS Code chat / Copilot
    ".interactive-result-editor-wrapper",
    ".chat-tree-container",
    ".rendered-markdown",
    ".markdown-body",
    // Generic: any element containing rendered markdown elements
    ".monaco-scrollable-element",
  ].join(", ");

  // ---------------------------------------------------------------------------
  // 8. Scan existing content
  // ---------------------------------------------------------------------------

  function scanAll() {
    var beforeCount = transformCount;

    // Scan known containers
    try {
      var containers = document.querySelectorAll(CHAT_SELECTORS);
      for (var i = 0; i < containers.length; i++) {
        processElement(containers[i]);
      }
    } catch (e) {
      console.warn(LOG_PREFIX, "Selector scan error:", e.message);
    }

    // Also scan any markdown elements directly (catch-all)
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

    // Also transform chat message containers
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
  // 9. MutationObserver — watch for new DOM nodes
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
    var shouldScan = false;

    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];

      // Process added nodes immediately
      for (var j = 0; j < mutation.addedNodes.length; j++) {
        var node = mutation.addedNodes[j];
        if (node.nodeType === Node.ELEMENT_NODE) {
          processElement(node);
          transformChatMessages(node);
          shouldScan = true;
        }
      }

      // For text changes (streaming responses), debounce a full scan
      if (mutation.type === "characterData") {
        shouldScan = true;
      }
    }

    // Debounce a full scan to catch anything we missed
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
  // 10. Periodic rescan (Cursor renders lazily, MutationObserver may miss)
  // ---------------------------------------------------------------------------

  // Initial scans: aggressive timing to catch the first render
  setTimeout(scanAll, 1000);
  setTimeout(scanAll, 3000);
  setTimeout(scanAll, 5000);
  setTimeout(scanAll, 10000);

  // Then periodic but less frequent
  setInterval(scanAll, 15000);

  // ---------------------------------------------------------------------------
  // 11. Debug helper: expose scan function globally
  // ---------------------------------------------------------------------------
  window.__ca11yScan = scanAll;
  window.__ca11yStats = function () {
    return {
      transformCount: transformCount,
      hasTrustedTypes: !!policy,
      hasLiveRegion: !!liveRegion,
      observerActive: true,
    };
  };

  console.log(LOG_PREFIX, "Chat accessibility layer active.");
  console.log(
    LOG_PREFIX,
    "Debug: run __ca11yScan() to trigger manual scan, __ca11yStats() for stats."
  );
})();
