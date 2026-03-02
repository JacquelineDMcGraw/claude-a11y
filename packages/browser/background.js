/**
 * background.js — Service worker for Claude Accessible Chrome extension.
 *
 * Minimal lifecycle management. Logs install/update events and handles
 * messages from the popup to query the content script status.
 */

const LOG_PREFIX = "[claude-accessible:bg]";

// ---------------------------------------------------------------------------
// Extension lifecycle events
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    console.log(LOG_PREFIX, "Extension installed.");
  } else if (details.reason === "update") {
    console.log(
      LOG_PREFIX,
      "Extension updated from",
      details.previousVersion,
      "to",
      chrome.runtime.getManifest().version
    );
  }
});

// ---------------------------------------------------------------------------
// Message handling — popup requests status from the active tab
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === "getStatus") {
    // Query the active tab and check if we are on a claude.ai page
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || tabs.length === 0) {
        sendResponse({ active: false, url: "" });
        return;
      }

      var tab = tabs[0];
      var url = tab.url || "";
      var isSupportedSite = /^https?:\/\/(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|copilot\.microsoft\.com)(\/|$)/.test(url);

      sendResponse({ active: isSupportedSite, url: url, tabId: tab.id });
    });

    // Return true to indicate we will send a response asynchronously
    return true;
  }

  if (message.type === "forceRescan") {
    // Execute __ca11yScan() in the active tab's main world
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || tabs.length === 0) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }

      chrome.scripting
        .executeScript({
          target: { tabId: tabs[0].id },
          world: "MAIN",
          func: function () {
            if (typeof window.__ca11yScan === "function") {
              window.__ca11yScan();
              var stats =
                typeof window.__ca11yStats === "function"
                  ? window.__ca11yStats()
                  : {};
              return { success: true, transformCount: stats.transformCount || 0 };
            }
            return { success: false, error: "chat-a11y.js not loaded" };
          },
        })
        .then(function (results) {
          if (results && results[0] && results[0].result) {
            sendResponse(results[0].result);
          } else {
            sendResponse({ success: false, error: "No result from script" });
          }
        })
        .catch(function (err) {
          sendResponse({ success: false, error: err.message });
        });
    });

    return true;
  }

  if (message.type === "getStats") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || tabs.length === 0) {
        sendResponse({ transformCount: 0 });
        return;
      }

      chrome.scripting
        .executeScript({
          target: { tabId: tabs[0].id },
          world: "MAIN",
          func: function () {
            if (typeof window.__ca11yStats === "function") {
              return window.__ca11yStats();
            }
            return null;
          },
        })
        .then(function (results) {
          if (results && results[0] && results[0].result) {
            sendResponse(results[0].result);
          } else {
            sendResponse({ transformCount: 0 });
          }
        })
        .catch(function () {
          sendResponse({ transformCount: 0 });
        });
    });

    return true;
  }
});

console.log(LOG_PREFIX, "Service worker started.");
