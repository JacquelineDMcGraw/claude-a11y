#!/usr/bin/env node
/**
 * patch-claude-app.js — Copies chat-a11y.js to clipboard for manual injection
 * into Claude Desktop via DevTools console.
 *
 * Claude Desktop's Electron fuses block all automated injection approaches:
 *   - EnableEmbeddedAsarIntegrityValidation: ON (can't modify app.asar)
 *   - EnableNodeCliInspectArguments: OFF (can't use --inspect or --remote-debugging-port)
 *   - EnableNodeOptionsEnvironmentVariable: OFF (can't use NODE_OPTIONS)
 *   - RunAsNode: OFF (can't use ELECTRON_RUN_AS_NODE)
 *
 * The only way to inject is through CLAUDE_DEV_TOOLS=detach which opens
 * an inline DevTools window. Use launch-claude-a11y.js for automated injection
 * on macOS, or this script for a manual clipboard-based approach.
 *
 * Usage:
 *   node patch-claude-app.js copy       # Copy chat-a11y.js to clipboard
 *   node patch-claude-app.js status     # Show info about Claude's security fuses
 *
 * Manual injection steps:
 *   1. Quit Claude Desktop (Cmd+Q)
 *   2. Run: CLAUDE_DEV_TOOLS=detach /Applications/Claude.app/Contents/MacOS/Claude
 *   3. In the DevTools window, click the Console tab
 *   4. Run: node patch-claude-app.js copy
 *   5. Paste (Cmd+V) into the console and press Enter
 *   6. You should see "[claude-accessible] Chat accessibility layer active."
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const CLAUDE_APP = "/Applications/Claude.app";
const CLAUDE_FRAMEWORK =
  CLAUDE_APP +
  "/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework";
const CHAT_A11Y_PATH = path.join(__dirname, "media", "chat-a11y.js");
const LOG_PREFIX = "[claude-accessible]";

function log(msg) {
  console.log(`${LOG_PREFIX} ${msg}`);
}

function error(msg) {
  console.error(`${LOG_PREFIX} ERROR: ${msg}`);
}

// ---------------------------------------------------------------------------
// Read Electron fuses from the binary
// ---------------------------------------------------------------------------

function readFuses() {
  if (!fs.existsSync(CLAUDE_FRAMEWORK)) {
    return null;
  }

  const data = fs.readFileSync(CLAUDE_FRAMEWORK);
  const sentinel = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX", "ascii");
  const idx = data.indexOf(sentinel);

  if (idx === -1) return null;

  const fuseData = data.subarray(idx + sentinel.length, idx + sentinel.length + 20);
  const count = fuseData[1];
  const values = fuseData.subarray(2, 2 + count);

  const names = [
    "RunAsNode",
    "EnableCookieEncryption",
    "EnableNodeOptionsEnvironmentVariable",
    "EnableNodeCliInspectArguments",
    "EnableEmbeddedAsarIntegrityValidation",
    "OnlyLoadAppFromAsar",
    "LoadBrowserProcessSpecificV8Snapshot",
    "GrantFileProtocolExtraPrivileges",
  ];

  const result = {};
  for (let i = 0; i < Math.min(names.length, values.length); i++) {
    const char = String.fromCharCode(values[i]);
    result[names[i]] = char === "1" ? "ENABLED" : char === "0" ? "DISABLED" : `UNKNOWN(${char})`;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Status: show fuse state and injection instructions
// ---------------------------------------------------------------------------

function showStatus() {
  log("Claude Desktop Accessibility Injection Status");
  log("==============================================");
  log("");

  if (!fs.existsSync(CLAUDE_APP)) {
    log("Claude Desktop not found at " + CLAUDE_APP);
    return;
  }

  log("Claude Desktop: FOUND");

  const fuses = readFuses();
  if (fuses) {
    log("");
    log("Electron Fuses (security restrictions):");
    for (const [name, status] of Object.entries(fuses)) {
      const icon = status === "ENABLED" ? "+" : "-";
      log(`  [${icon}] ${name}: ${status}`);
    }

    log("");
    log("What this means:");

    if (fuses.EnableEmbeddedAsarIntegrityValidation === "ENABLED") {
      log("  - Cannot modify app.asar (integrity hash check)");
    }
    if (fuses.EnableNodeCliInspectArguments === "DISABLED") {
      log("  - Cannot use --inspect or --remote-debugging-port");
    }
    if (fuses.EnableNodeOptionsEnvironmentVariable === "DISABLED") {
      log("  - Cannot use NODE_OPTIONS environment variable");
    }
    if (fuses.RunAsNode === "DISABLED") {
      log("  - Cannot use ELECTRON_RUN_AS_NODE");
    }
  }

  log("");
  log("Available injection method: CLAUDE_DEV_TOOLS + DevTools console");
  log("");
  log("Automated (macOS only):");
  log("  node launch-claude-a11y.js");
  log("");
  log("Manual (any OS):");
  log("  1. Quit Claude (Cmd+Q)");
  log("  2. CLAUDE_DEV_TOOLS=detach /Applications/Claude.app/Contents/MacOS/Claude");
  log("  3. node patch-claude-app.js copy");
  log("  4. Paste into DevTools console, press Enter");
}

// ---------------------------------------------------------------------------
// Copy to clipboard
// ---------------------------------------------------------------------------

function copyToClipboard() {
  if (!fs.existsSync(CHAT_A11Y_PATH)) {
    error("chat-a11y.js not found at " + CHAT_A11Y_PATH);
    process.exit(1);
  }

  const scriptCode = fs.readFileSync(CHAT_A11Y_PATH, "utf-8");

  if (process.platform === "darwin") {
    execSync("pbcopy", { input: scriptCode, encoding: "utf-8" });
  } else if (process.platform === "linux") {
    try {
      execSync("xclip -selection clipboard", { input: scriptCode, encoding: "utf-8" });
    } catch {
      try {
        execSync("xsel --clipboard --input", { input: scriptCode, encoding: "utf-8" });
      } catch {
        error("No clipboard tool found. Install xclip or xsel.");
        log("Script content saved to /tmp/chat-a11y-inject.js instead.");
        fs.writeFileSync("/tmp/chat-a11y-inject.js", scriptCode, "utf-8");
        process.exit(1);
      }
    }
  } else if (process.platform === "win32") {
    execSync("clip", { input: scriptCode, encoding: "utf-8" });
  } else {
    error("Unknown platform. Script saved to /tmp/chat-a11y-inject.js");
    fs.writeFileSync("/tmp/chat-a11y-inject.js", scriptCode, "utf-8");
    process.exit(1);
  }

  log("chat-a11y.js copied to clipboard! (" + scriptCode.length + " bytes)");
  log("");
  log("Now paste (Cmd+V / Ctrl+V) into the DevTools console and press Enter.");
  log("");
  log("You should see:");
  log('  [claude-accessible] Chat accessibility layer active.');
  log("  [claude-accessible] TrustedTypes policy created.");
  log("");
  log("Verify with: __ca11yStats()");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const command = process.argv[2] || "status";

switch (command) {
  case "copy":
  case "clipboard":
    copyToClipboard();
    break;
  case "status":
  case "check":
  case "info":
    showStatus();
    break;
  default:
    console.log("Usage: node patch-claude-app.js [copy|status]");
    console.log("");
    console.log("  copy    — Copy chat-a11y.js to clipboard for DevTools paste");
    console.log("  status  — Show Claude Desktop security info and injection methods");
    process.exit(1);
}
