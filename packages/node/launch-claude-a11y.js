#!/usr/bin/env node
/**
 * launch-claude-a11y.js — Launch Claude Desktop with chat accessibility injection.
 *
 * Claude Desktop's Electron fuses block all programmatic injection methods:
 *   - EnableEmbeddedAsarIntegrityValidation (can't modify app.asar)
 *   - EnableNodeCliInspectArguments disabled (can't use --inspect / --remote-debugging-port)
 *   - EnableNodeOptionsEnvironmentVariable disabled (can't use NODE_OPTIONS)
 *   - RunAsNode disabled (can't use ELECTRON_RUN_AS_NODE)
 *
 * The only injection path is CLAUDE_DEV_TOOLS=detach, which opens an inline
 * DevTools window. This script launches Claude with DevTools open, copies
 * chat-a11y.js to clipboard, and either auto-injects (if Accessibility
 * permissions are granted) or prompts the user to paste.
 *
 * Usage:
 *   node launch-claude-a11y.js              # Launch + inject (auto or manual)
 *   node launch-claude-a11y.js --copy-only  # Just copy script to clipboard
 *   node launch-claude-a11y.js --no-launch  # Don't launch Claude, just inject
 *
 * For fully automated injection on macOS, grant Accessibility to your terminal:
 *   System Settings > Privacy & Security > Accessibility > add Terminal.app
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync, spawn } = require("node:child_process");

const CLAUDE_BIN = "/Applications/Claude.app/Contents/MacOS/Claude";
const CHAT_A11Y_PATH = path.join(__dirname, "media", "chat-a11y.js");
const LOG = "[claude-a11y]";

function log(...a) { console.log(LOG, ...a); }
function err(...a) { console.error(LOG, "ERROR:", ...a); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function osascript(script) {
  try {
    return execSync(
      `osascript -e '${script.replace(/'/g, "'\"'\"'")}'`,
      { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
  } catch { return null; }
}

function isClaudeRunning() {
  try { execSync("pgrep -x Claude", { stdio: "pipe" }); return true; }
  catch { return false; }
}

function copyToClipboard(text) {
  if (process.platform === "darwin") {
    execSync("pbcopy", { input: text, encoding: "utf-8" });
  } else if (process.platform === "win32") {
    execSync("clip", { input: text, encoding: "utf-8" });
  } else {
    try { execSync("xclip -selection clipboard", { input: text }); }
    catch { execSync("xsel --clipboard --input", { input: text }); }
  }
}

/**
 * Check if we have FULL Accessibility permissions (not just basic process info).
 * The test is: can we read window properties from System Events?
 */
function hasFullAccessibility() {
  // This specific query REQUIRES full accessibility permissions
  const result = osascript(
    'tell application "System Events" to tell process "Claude" to get name of every window'
  );
  return result !== null;
}

/**
 * Auto-inject via AppleScript (requires full Accessibility permissions).
 */
async function autoInject(scriptCode) {
  log("Auto-injecting via AppleScript...");

  // Wait for DevTools window
  let found = false;
  for (let i = 0; i < 20; i++) {
    const names = osascript(
      'tell application "System Events" to tell process "Claude" to get name of every window'
    );
    if (names && names.includes("DevTools")) { found = true; break; }
    await sleep(1500);
  }

  if (!found) {
    log("DevTools window not detected.");
    return false;
  }

  log("DevTools window found. Waiting for initialization...");
  await sleep(3000);

  // Focus DevTools, switch to Console, paste, execute
  osascript(`
tell application "System Events"
  tell process "Claude"
    set frontmost to true
    delay 0.3
    repeat with w in windows
      if name of w contains "DevTools" then
        perform action "AXRaise" of w
        exit repeat
      end if
    end repeat
    delay 0.5
    key code 53
    delay 0.2
  end tell
end tell
`);

  await sleep(500);

  // Copy script to clipboard and paste
  copyToClipboard(scriptCode);
  await sleep(300);

  const result = osascript(`
tell application "System Events"
  tell process "Claude"
    keystroke "v" using {command down}
    delay 1
    key code 36
  end tell
end tell
return "ok"
`);

  if (result) {
    log("Injection command executed!");
    await sleep(2000);

    // Verify
    copyToClipboard("JSON.stringify(__ca11yStats())");
    await sleep(200);
    osascript(`
tell application "System Events"
  tell process "Claude"
    keystroke "v" using {command down}
    delay 0.5
    key code 36
  end tell
end tell
`);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const copyOnly = process.argv.includes("--copy-only");
  const noLaunch = process.argv.includes("--no-launch");

  if (process.platform !== "darwin") {
    err("This launcher requires macOS.");
    err("On other platforms, set CLAUDE_DEV_TOOLS=detach, launch Claude,");
    err("then paste chat-a11y.js into the DevTools console.");
    process.exit(1);
  }

  if (!fs.existsSync(CHAT_A11Y_PATH)) {
    err("chat-a11y.js not found at", CHAT_A11Y_PATH);
    process.exit(1);
  }

  const scriptCode = fs.readFileSync(CHAT_A11Y_PATH, "utf-8");

  // --copy-only: just put it on the clipboard
  if (copyOnly) {
    copyToClipboard(scriptCode);
    log("Copied chat-a11y.js to clipboard (" + scriptCode.length + " bytes)");
    log("Paste into DevTools Console and press Enter.");
    return;
  }

  if (!fs.existsSync(CLAUDE_BIN)) {
    err("Claude Desktop not found at", CLAUDE_BIN);
    process.exit(1);
  }

  // Launch Claude with DevTools
  if (!noLaunch && !isClaudeRunning()) {
    log("Launching Claude Desktop with DevTools...");
    const cp = spawn(CLAUDE_BIN, [], {
      env: { ...process.env, CLAUDE_DEV_TOOLS: "detach" },
      stdio: "ignore",
      detached: true,
    });
    cp.unref();
    log("Claude PID:", cp.pid);
    await sleep(5000);
  } else if (!noLaunch && isClaudeRunning()) {
    log("Claude is already running.");
  }

  // Copy script to clipboard first (needed for both auto and manual)
  copyToClipboard(scriptCode);

  // Try auto-injection if we have accessibility permissions
  if (hasFullAccessibility()) {
    log("Accessibility: granted — attempting auto-injection...");
    const ok = await autoInject(scriptCode);
    if (ok) {
      log("");
      log("Chat accessibility is ACTIVE in Claude Desktop!");
      log("Screen readers will hear: [Python], [End Python], [Heading], etc.");
      log("");
      log("Debug: __ca11yStats() and __ca11yScan() in DevTools console.");
      return;
    }
    log("Auto-injection failed, falling back to manual mode.");
  }

  // Manual mode
  log("");
  log("chat-a11y.js is on your clipboard (" + scriptCode.length + " bytes).");
  log("");
  log("To inject, do these 3 steps in the DevTools window:");
  log("");
  log("  1. Click in the Console (bottom of the DevTools window)");
  log("  2. Cmd+V to paste");
  log("  3. Press Enter");
  log("");
  log("You'll see: [claude-accessible] Chat accessibility layer active.");
  log("Verify: type __ca11yStats() and press Enter.");
  log("");

  if (!hasFullAccessibility()) {
    log("--- To enable auto-injection next time ---");
    log("System Settings > Privacy & Security > Accessibility");
    log("Add your terminal app (Terminal.app, iTerm, Warp, etc.)");
  }
}

main().catch(e => { err(e.message); process.exit(1); });
