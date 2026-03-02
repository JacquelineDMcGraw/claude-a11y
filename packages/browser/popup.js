/**
 * popup.js — Logic for the Claude Accessible popup UI.
 *
 * Communicates with background.js to get extension status, stats,
 * and to trigger a force rescan on the active tab.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------------
  var statusIndicator = document.getElementById("status-indicator");
  var statusText = document.getElementById("status-text");
  var statTransformCount = document.getElementById("stat-transform-count");
  var statObserver = document.getElementById("stat-observer");
  var statLiveRegion = document.getElementById("stat-live-region");
  var rescanBtn = document.getElementById("rescan-btn");
  var rescanFeedback = document.getElementById("rescan-feedback");
  var versionText = document.getElementById("version-text");

  // ---------------------------------------------------------------------------
  // Display version from manifest
  // ---------------------------------------------------------------------------
  var manifest = chrome.runtime.getManifest();
  if (versionText && manifest.version) {
    versionText.textContent = "v" + manifest.version;
  }

  // ---------------------------------------------------------------------------
  // Set status display
  // ---------------------------------------------------------------------------
  function setStatus(state, text) {
    statusIndicator.setAttribute("data-status", state);
    statusText.textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Update stats display
  // ---------------------------------------------------------------------------
  function updateStats(stats) {
    if (!stats) {
      statTransformCount.textContent = "--";
      statObserver.textContent = "--";
      statLiveRegion.textContent = "--";
      return;
    }

    statTransformCount.textContent = String(stats.transformCount || 0);
    statObserver.textContent = stats.observerActive ? "Active" : "Inactive";
    statLiveRegion.textContent = stats.hasLiveRegion ? "Active" : "Inactive";
  }

  // ---------------------------------------------------------------------------
  // Check if we are on a claude.ai page and fetch stats
  // ---------------------------------------------------------------------------
  function checkStatus() {
    setStatus("loading", "Checking...");

    chrome.runtime.sendMessage({ type: "getStatus" }, function (response) {
      if (chrome.runtime.lastError) {
        setStatus("inactive", "Error communicating with extension");
        updateStats(null);
        return;
      }

      if (!response) {
        setStatus("inactive", "No response");
        updateStats(null);
        return;
      }

      if (response.active) {
        setStatus("active", "Active on supported AI chat site");
        fetchStats();
      } else {
        setStatus("inactive", "Not on a supported AI chat site");
        updateStats(null);
        rescanBtn.disabled = true;
        rescanBtn.setAttribute(
          "aria-label",
          "Force Rescan (unavailable — navigate to a supported AI chat site first)"
        );
      }
    });
  }

  function fetchStats() {
    chrome.runtime.sendMessage({ type: "getStats" }, function (response) {
      if (chrome.runtime.lastError) {
        updateStats(null);
        return;
      }
      updateStats(response);
    });
  }

  // ---------------------------------------------------------------------------
  // Force Rescan button
  // ---------------------------------------------------------------------------
  rescanBtn.addEventListener("click", function () {
    rescanBtn.disabled = true;
    rescanFeedback.textContent = "Scanning...";

    chrome.runtime.sendMessage({ type: "forceRescan" }, function (response) {
      rescanBtn.disabled = false;

      if (chrome.runtime.lastError) {
        rescanFeedback.textContent = "Error: " + chrome.runtime.lastError.message;
        return;
      }

      if (response && response.success) {
        rescanFeedback.textContent =
          "Rescan complete — " + response.transformCount + " elements transformed.";
        // Refresh stats
        fetchStats();
      } else {
        var errorMsg = (response && response.error) || "Unknown error";
        rescanFeedback.textContent = "Rescan failed: " + errorMsg;
      }

      // Clear feedback after a few seconds
      setTimeout(function () {
        rescanFeedback.textContent = "";
      }, 5000);
    });
  });

  // ---------------------------------------------------------------------------
  // Keyboard: Enter/Space on the button (native behavior, but ensure it)
  // ---------------------------------------------------------------------------
  rescanBtn.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      rescanBtn.click();
    }
  });

  // ---------------------------------------------------------------------------
  // Export feedback data — copies stats to clipboard as JSON
  // ---------------------------------------------------------------------------
  var exportBtn = document.getElementById("export-btn");
  var exportFeedback = document.getElementById("export-feedback");

  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      exportBtn.disabled = true;
      exportFeedback.textContent = "Collecting data...";

      chrome.runtime.sendMessage({ type: "getStats" }, function (response) {
        exportBtn.disabled = false;

        var data = {
          timestamp: new Date().toISOString(),
          extensionVersion: manifest.version || "unknown",
          userAgent: navigator.userAgent,
          stats: response || null,
        };

        // Read stored session stats if available
        try {
          chrome.storage.local.get(["ca11y_sessions"], function (stored) {
            if (stored && stored.ca11y_sessions) {
              data.sessionHistory = stored.ca11y_sessions;
            }

            var json = JSON.stringify(data, null, 2);
            navigator.clipboard.writeText(json).then(function () {
              exportFeedback.textContent = "Copied to clipboard. Paste into a GitHub issue.";
              setTimeout(function () { exportFeedback.textContent = ""; }, 5000);
            }).catch(function () {
              exportFeedback.textContent = "Could not copy. Data logged to console.";
              console.log("[claude-accessible] Feedback data:", json);
              setTimeout(function () { exportFeedback.textContent = ""; }, 5000);
            });
          });
        } catch (e) {
          var json = JSON.stringify(data, null, 2);
          navigator.clipboard.writeText(json).then(function () {
            exportFeedback.textContent = "Copied to clipboard.";
          }).catch(function () {
            exportFeedback.textContent = "Could not copy. Check console.";
            console.log("[claude-accessible] Feedback data:", json);
          });
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Track session stats in chrome.storage.local (opt-in, local only)
  // ---------------------------------------------------------------------------
  function recordSession(stats) {
    if (!stats || !chrome.storage) return;
    try {
      chrome.storage.local.get(["ca11y_sessions"], function (stored) {
        var sessions = (stored && stored.ca11y_sessions) || [];
        sessions.push({
          timestamp: new Date().toISOString(),
          transforms: stats.transformCount || 0,
          fallback: !!stats.fallbackActive,
          selectorWarning: !!stats.selectorHealthWarning,
          selectorVersion: stats.selectorVersion || 0,
        });
        // Keep last 50 sessions
        if (sessions.length > 50) sessions = sessions.slice(-50);
        chrome.storage.local.set({ ca11y_sessions: sessions });
      });
    } catch (e) {
      // Storage not available — non-critical
    }
  }

  // Record this session's stats when popup opens
  chrome.runtime.sendMessage({ type: "getStats" }, function (response) {
    if (response) recordSession(response);
  });

  // ---------------------------------------------------------------------------
  // Initialize on popup open
  // ---------------------------------------------------------------------------
  checkStatus();
})();
