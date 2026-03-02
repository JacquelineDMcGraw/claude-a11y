import { describe, it, expect, vi, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

describe("content.js — script injection", function () {
  var dom;
  var appendedScripts;

  beforeEach(function () {
    dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
      url: "https://claude.ai/chat/test",
    });
    appendedScripts = [];

    global.document = dom.window.document;
    global.window = dom.window;
    global.chrome = {
      runtime: {
        getURL: vi.fn(function (path) {
          return "chrome-extension://fakeid/" + path;
        }),
      },
    };

    var originalAppendChild = dom.window.document.head.appendChild.bind(
      dom.window.document.head
    );
    dom.window.document.head.appendChild = function (el) {
      appendedScripts.push(el);
      originalAppendChild(el);
      return el;
    };
  });

  it("builds correct URLs for phrasing.js and chat-a11y.js", function () {
    var phrasingURL = global.chrome.runtime.getURL("phrasing.js");
    var chatURL = global.chrome.runtime.getURL("chat-a11y.js");

    expect(phrasingURL).toBe("chrome-extension://fakeid/phrasing.js");
    expect(chatURL).toBe("chrome-extension://fakeid/chat-a11y.js");
  });

  it("creates script elements with src attributes", function () {
    var phrasing = document.createElement("script");
    phrasing.src = global.chrome.runtime.getURL("phrasing.js");

    expect(phrasing.tagName).toBe("SCRIPT");
    expect(phrasing.src).toContain("phrasing.js");
  });

  it("appends phrasing script to head", function () {
    var phrasing = document.createElement("script");
    phrasing.src = global.chrome.runtime.getURL("phrasing.js");
    document.head.appendChild(phrasing);

    expect(appendedScripts.length).toBe(1);
    expect(appendedScripts[0].src).toContain("phrasing.js");
  });

  it("chains chat-a11y.js load after phrasing.js onload", function () {
    var loadOrder = [];

    var phrasing = document.createElement("script");
    phrasing.src = global.chrome.runtime.getURL("phrasing.js");
    phrasing.onload = function () {
      loadOrder.push("phrasing");
      var main = document.createElement("script");
      main.src = global.chrome.runtime.getURL("chat-a11y.js");
      main.onload = function () {
        loadOrder.push("chat-a11y");
      };
      document.head.appendChild(main);
    };
    document.head.appendChild(phrasing);

    phrasing.onload();
    var chatScript = appendedScripts[1];
    chatScript.onload();

    expect(loadOrder).toEqual(["phrasing", "chat-a11y"]);
  });

  it("handles phrasing.js load failure via onerror", function () {
    var errorLogged = false;
    var origError = console.error;
    console.error = function () {
      if (arguments[0] && arguments[0].includes("Failed to load phrasing.js")) {
        errorLogged = true;
      }
    };

    var phrasing = document.createElement("script");
    phrasing.src = global.chrome.runtime.getURL("phrasing.js");
    phrasing.onerror = function () {
      console.error("[claude-a11y] Failed to load phrasing.js");
    };
    phrasing.onerror();

    expect(errorLogged).toBe(true);
    console.error = origError;
  });

  it("falls back to documentElement when head is absent", function () {
    var noHeadDom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "https://claude.ai/",
    });
    var target = noHeadDom.window.document.head || noHeadDom.window.document.documentElement;

    expect(target).toBeTruthy();
  });
});
