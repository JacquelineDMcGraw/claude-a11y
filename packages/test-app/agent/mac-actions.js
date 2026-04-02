const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SCREENSHOT_DIR = path.join(os.tmpdir(), "claude-a11y-screenshots");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function screenshot() {
  const file = path.join(SCREENSHOT_DIR, `screen-${Date.now()}.png`);
  execFileSync("screencapture", ["-x", "-C", file]);
  const data = fs.readFileSync(file);
  fs.unlinkSync(file);
  return data.toString("base64");
}

function screenshotRegion(x1, y1, x2, y2) {
  const file = path.join(SCREENSHOT_DIR, `region-${Date.now()}.png`);
  execFileSync("screencapture", [
    "-x", "-R", `${x1},${y1},${x2 - x1},${y2 - y1}`, file,
  ]);
  const data = fs.readFileSync(file);
  fs.unlinkSync(file);
  return data.toString("base64");
}

function leftClick(x, y) {
  execFileSync("cliclick", ["c:" + x + "," + y]);
}

function rightClick(x, y) {
  execFileSync("cliclick", ["rc:" + x + "," + y]);
}

function doubleClick(x, y) {
  execFileSync("cliclick", ["dc:" + x + "," + y]);
}

function tripleClick(x, y) {
  execFileSync("cliclick", ["tc:" + x + "," + y]);
}

function mouseMove(x, y) {
  execFileSync("cliclick", ["m:" + x + "," + y]);
}

function leftClickDrag(startX, startY, endX, endY) {
  execFileSync("cliclick", ["dd:" + startX + "," + startY, "du:" + endX + "," + endY]);
}

function typeText(text) {
  execFileSync("cliclick", ["t:" + text]);
}

function keyPress(keys) {
  const mapping = {
    "return": "return", "enter": "return",
    "tab": "tab", "escape": "esc", "esc": "esc",
    "space": "space",
    "backspace": "delete", "delete": "fwd-delete",
    "up": "arrow-up", "down": "arrow-down",
    "left": "arrow-left", "right": "arrow-right",
    "home": "home", "end": "end",
    "pageup": "page-up", "pagedown": "page-down",
    "f1": "f1", "f2": "f2", "f3": "f3", "f4": "f4",
    "f5": "f5", "f6": "f6", "f7": "f7", "f8": "f8",
    "f9": "f9", "f10": "f10", "f11": "f11", "f12": "f12",
  };

  const parts = keys.toLowerCase().split("+").map((k) => k.trim());
  const modifiers = [];
  let mainKey = "";

  for (const part of parts) {
    if (["ctrl", "control"].includes(part)) modifiers.push("ctrl");
    else if (["alt", "option"].includes(part)) modifiers.push("alt");
    else if (["shift"].includes(part)) modifiers.push("shift");
    else if (["cmd", "command", "super", "meta"].includes(part)) modifiers.push("cmd");
    else mainKey = mapping[part] || part;
  }

  if (modifiers.length > 0 && mainKey) {
    const mod = modifiers.join(",");
    execFileSync("cliclick", ["kd:" + mod, "kp:" + mainKey, "ku:" + mod]);
  } else if (mainKey) {
    execFileSync("cliclick", ["kp:" + mainKey]);
  }
}

function scroll(x, y, direction, amount) {
  const scrollMap = { up: "up", down: "down", left: "left", right: "right" };
  const dir = scrollMap[direction] || "down";

  execFileSync("cliclick", ["m:" + x + "," + y]);

  const keyCodes = { up: 126, down: 125, left: 123, right: 124 };
  const code = keyCodes[dir];
  for (let i = 0; i < (amount || 3); i++) {
    execSync(`osascript -e 'tell application "System Events" to key code ${code} using {option down}'`);
  }
}

function wait(seconds) {
  const ms = Math.min((seconds || 1) * 1000, 30000);
  execSync(`sleep ${ms / 1000}`);
}

function runBash(command) {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout: 120000,
      cwd: process.env.AGENT_CWD || process.cwd(),
      env: { ...process.env, TERM: "xterm-256color" },
    });
    return { output: output.slice(0, 50000), exitCode: 0 };
  } catch (err) {
    return {
      output: ((err.stdout || "") + "\n" + (err.stderr || "")).slice(0, 50000),
      exitCode: err.status || 1,
    };
  }
}

function handleAction(action, params) {
  switch (action) {
    case "screenshot":
      return { type: "screenshot", base64: screenshot() };

    case "zoom":
      if (params.region) {
        const [x1, y1, x2, y2] = params.region;
        return { type: "screenshot", base64: screenshotRegion(x1, y1, x2, y2) };
      }
      return { type: "screenshot", base64: screenshot() };

    case "left_click":
      leftClick(params.coordinate[0], params.coordinate[1]);
      return { type: "success" };

    case "right_click":
      rightClick(params.coordinate[0], params.coordinate[1]);
      return { type: "success" };

    case "double_click":
      doubleClick(params.coordinate[0], params.coordinate[1]);
      return { type: "success" };

    case "triple_click":
      tripleClick(params.coordinate[0], params.coordinate[1]);
      return { type: "success" };

    case "mouse_move":
      mouseMove(params.coordinate[0], params.coordinate[1]);
      return { type: "success" };

    case "left_click_drag":
      leftClickDrag(
        params.start_coordinate[0], params.start_coordinate[1],
        params.coordinate[0], params.coordinate[1]
      );
      return { type: "success" };

    case "type":
      typeText(params.text);
      return { type: "success" };

    case "key":
      keyPress(params.key);
      return { type: "success" };

    case "scroll":
      scroll(
        params.coordinate[0], params.coordinate[1],
        params.scroll_direction, params.scroll_amount
      );
      return { type: "success" };

    case "wait":
      wait(params.duration);
      return { type: "success" };

    default:
      return { type: "error", message: `Unknown action: ${action}` };
  }
}

module.exports = {
  screenshot,
  screenshotRegion,
  handleAction,
  runBash,
  leftClick,
  rightClick,
  doubleClick,
  mouseMove,
  typeText,
  keyPress,
  scroll,
  wait,
};
