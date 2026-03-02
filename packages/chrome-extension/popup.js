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
        setStatus("active", "Active on claude.ai");
        fetchStats();
      } else {
        setStatus("inactive", "Not on claude.ai");
        updateStats(null);
        rescanBtn.disabled = true;
        rescanBtn.setAttribute(
          "aria-label",
          "Force Rescan (unavailable — navigate to claude.ai first)"
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
  // Initialize on popup open
  // ---------------------------------------------------------------------------
  checkStatus();
})();
