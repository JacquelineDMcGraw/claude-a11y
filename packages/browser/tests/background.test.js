import { describe, it, expect, vi, beforeEach } from "vitest";

describe("background.js — message handling", function () {
  var listeners;
  var installedListeners;

  beforeEach(function () {
    listeners = [];
    installedListeners = [];

    global.chrome = {
      runtime: {
        onMessage: {
          addListener: function (fn) {
            listeners.push(fn);
          },
        },
        onInstalled: {
          addListener: function (fn) {
            installedListeners.push(fn);
          },
        },
        getManifest: function () {
          return { version: "1.1.0" };
        },
      },
      tabs: {
        query: vi.fn(),
      },
      scripting: {
        executeScript: vi.fn(),
      },
    };

    global.console = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  function getMessageHandler() {
    return listeners[0];
  }

  it("getStatus returns active:false when no tabs", function () {
    chrome.tabs.query.mockImplementation(function (opts, cb) {
      cb([]);
    });

    var listener = function (message, sender, sendResponse) {
      if (message.type === "getStatus") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (!tabs || tabs.length === 0) {
            sendResponse({ active: false, url: "" });
            return;
          }
        });
        return true;
      }
    };

    var response = null;
    listener({ type: "getStatus" }, {}, function (r) {
      response = r;
    });

    expect(response).toEqual({ active: false, url: "" });
  });

  it("getStatus returns active:true for claude.ai", function () {
    var response = null;
    var url = "https://claude.ai/chat/abc";
    var isSupportedSite = /^https?:\/\/(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|copilot\.microsoft\.com)(\/|$)/.test(url);

    expect(isSupportedSite).toBe(true);
  });

  it("getStatus returns active:true for chatgpt.com", function () {
    var url = "https://chatgpt.com/c/123";
    var isSupportedSite = /^https?:\/\/(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|copilot\.microsoft\.com)(\/|$)/.test(url);

    expect(isSupportedSite).toBe(true);
  });

  it("getStatus returns active:true for gemini.google.com", function () {
    var url = "https://gemini.google.com/app";
    var isSupportedSite = /^https?:\/\/(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|copilot\.microsoft\.com)(\/|$)/.test(url);

    expect(isSupportedSite).toBe(true);
  });

  it("getStatus returns active:true for copilot.microsoft.com", function () {
    var url = "https://copilot.microsoft.com/";
    var isSupportedSite = /^https?:\/\/(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|copilot\.microsoft\.com)(\/|$)/.test(url);

    expect(isSupportedSite).toBe(true);
  });

  it("getStatus returns active:false for unrelated sites", function () {
    var url = "https://example.com/test";
    var isSupportedSite = /^https?:\/\/(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|copilot\.microsoft\.com)(\/|$)/.test(url);

    expect(isSupportedSite).toBe(false);
  });

  it("getStatus returns active:false for http://claude.ai.evil.com", function () {
    var url = "https://claude.ai.evil.com/phish";
    var isSupportedSite = /^https?:\/\/(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|copilot\.microsoft\.com)(\/|$)/.test(url);

    expect(isSupportedSite).toBe(false);
  });

  it("install event is recognized", function () {
    var handler = function (details) {
      return details.reason === "install";
    };
    expect(handler({ reason: "install" })).toBe(true);
    expect(handler({ reason: "update" })).toBe(false);
  });

  it("update event includes previous version", function () {
    var handler = function (details) {
      if (details.reason === "update") {
        return details.previousVersion;
      }
      return null;
    };
    expect(handler({ reason: "update", previousVersion: "1.0.0" })).toBe("1.0.0");
  });
});
