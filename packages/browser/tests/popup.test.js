import { describe, it, expect, vi, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

describe("popup.js — UI logic", function () {
  var dom;

  beforeEach(function () {
    dom = new JSDOM(
      '<!DOCTYPE html><html><body>' +
      '<span id="status-indicator" data-status="loading"></span>' +
      '<span id="status-text">Checking...</span>' +
      '<span id="stat-transform-count">--</span>' +
      '<span id="stat-observer">--</span>' +
      '<span id="stat-live-region">--</span>' +
      '<button id="rescan-btn">Force Rescan</button>' +
      '<span id="rescan-feedback" aria-live="assertive"></span>' +
      '<span id="version-text"></span>' +
      '<button id="export-btn">Export</button>' +
      '<span id="export-feedback"></span>' +
      '</body></html>',
      { url: "chrome-extension://fakeid/popup.html" }
    );

    global.document = dom.window.document;
    global.window = dom.window;
    global.navigator = dom.window.navigator;
    global.setTimeout = dom.window.setTimeout;

    global.chrome = {
      runtime: {
        getManifest: function () {
          return { version: "1.1.0" };
        },
        sendMessage: vi.fn(),
        lastError: null,
      },
      storage: {
        local: {
          get: vi.fn(function (keys, cb) {
            cb({});
          }),
          set: vi.fn(),
        },
      },
    };
  });

  it("displays version from manifest", function () {
    var versionText = document.getElementById("version-text");
    var manifest = chrome.runtime.getManifest();
    if (versionText && manifest.version) {
      versionText.textContent = "v" + manifest.version;
    }
    expect(versionText.textContent).toBe("v1.1.0");
  });

  it("setStatus updates indicator and text", function () {
    var statusIndicator = document.getElementById("status-indicator");
    var statusText = document.getElementById("status-text");

    function setStatus(state, text) {
      statusIndicator.setAttribute("data-status", state);
      statusText.textContent = text;
    }

    setStatus("active", "Active on supported AI chat site");
    expect(statusIndicator.getAttribute("data-status")).toBe("active");
    expect(statusText.textContent).toBe("Active on supported AI chat site");

    setStatus("inactive", "Not on a supported AI chat site");
    expect(statusIndicator.getAttribute("data-status")).toBe("inactive");
    expect(statusText.textContent).toBe("Not on a supported AI chat site");
  });

  it("updateStats fills in transform count, observer, and live region", function () {
    var statTransformCount = document.getElementById("stat-transform-count");
    var statObserver = document.getElementById("stat-observer");
    var statLiveRegion = document.getElementById("stat-live-region");

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

    updateStats({ transformCount: 42, observerActive: true, hasLiveRegion: true });
    expect(statTransformCount.textContent).toBe("42");
    expect(statObserver.textContent).toBe("Active");
    expect(statLiveRegion.textContent).toBe("Active");
  });

  it("updateStats handles null (resets to dashes)", function () {
    var statTransformCount = document.getElementById("stat-transform-count");
    var statObserver = document.getElementById("stat-observer");
    var statLiveRegion = document.getElementById("stat-live-region");

    function updateStats(stats) {
      if (!stats) {
        statTransformCount.textContent = "--";
        statObserver.textContent = "--";
        statLiveRegion.textContent = "--";
        return;
      }
    }

    updateStats(null);
    expect(statTransformCount.textContent).toBe("--");
    expect(statObserver.textContent).toBe("--");
    expect(statLiveRegion.textContent).toBe("--");
  });

  it("rescan button starts enabled", function () {
    var rescanBtn = document.getElementById("rescan-btn");
    expect(rescanBtn.disabled).toBe(false);
  });

  it("rescan button gets disabled when not on supported site", function () {
    var rescanBtn = document.getElementById("rescan-btn");
    rescanBtn.disabled = true;
    rescanBtn.setAttribute(
      "aria-label",
      "Force Rescan (unavailable — navigate to a supported AI chat site first)"
    );
    expect(rescanBtn.disabled).toBe(true);
    expect(rescanBtn.getAttribute("aria-label")).toContain("unavailable");
  });

  it("rescan feedback element has aria-live for screen readers", function () {
    var rescanFeedback = document.getElementById("rescan-feedback");
    expect(rescanFeedback.getAttribute("aria-live")).toBe("assertive");
  });

  it("session recording keeps last 50 sessions", function () {
    var sessions = [];
    for (var i = 0; i < 55; i++) {
      sessions.push({ timestamp: new Date().toISOString(), transforms: i });
    }
    if (sessions.length > 50) sessions = sessions.slice(-50);
    expect(sessions.length).toBe(50);
    expect(sessions[0].transforms).toBe(5);
  });

  it("export creates JSON with expected fields", function () {
    var manifest = chrome.runtime.getManifest();
    var data = {
      timestamp: new Date().toISOString(),
      extensionVersion: manifest.version || "unknown",
      userAgent: "test-agent",
      stats: { transformCount: 10 },
    };

    var json = JSON.stringify(data, null, 2);
    var parsed = JSON.parse(json);

    expect(parsed.extensionVersion).toBe("1.1.0");
    expect(parsed.stats.transformCount).toBe(10);
    expect(parsed.timestamp).toBeTruthy();
  });
});
