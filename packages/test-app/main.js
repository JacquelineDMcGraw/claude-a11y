const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, session, systemPreferences, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn, execSync } = require("child_process");

const pty = require("node-pty");
const { hasScreenCapturePermission, hasPromptedForPermission } = process.platform === "darwin"
  ? require("mac-screen-capture-permissions")
  : { hasScreenCapturePermission: () => true, hasPromptedForPermission: () => true };

const { AgentLoop, getModeConfig, listModes } = require("./agent/index");

let mainWindow;
let ptyProcess;
let whisperPath = "";
let whisperModel = "medium";
let activeAgent = null;

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RECORDINGS_DIR = path.join(REPO_ROOT, "recordings");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "claude-a11y Testing",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Grant media permissions for screen/audio capture
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  // Handle getDisplayMedia requests: auto-select the primary screen
  // so the user doesn't get a picker dialog
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    if (sources.length > 0) {
      callback({ video: sources[0], audio: "loopback" });
    } else {
      callback({});
    }
  });

  mainWindow.on("closed", () => {
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  detectWhisper();

  // On macOS, trigger the native screen recording permission popup.
  // hasScreenCapturePermission() calls CGRequestScreenCaptureAccess()
  // which shows the system dialog the first time it's called.
  if (process.platform === "darwin") {
    hasScreenCapturePermission();
  }

  createWindow();
});

app.on("window-all-closed", () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
  app.quit();
});

function detectWhisper() {
  const candidates = [
    "whisper",
    path.join(os.homedir(), "miniconda3", "bin", "whisper"),
    path.join(os.homedir(), "anaconda3", "bin", "whisper"),
    "/opt/homebrew/bin/whisper",
    "/usr/local/bin/whisper",
  ];

  for (const candidate of candidates) {
    try {
      const resolved = candidate.startsWith("/")
        ? candidate
        : require("child_process").execSync(`which ${candidate}`, { encoding: "utf-8" }).trim();
      if (fs.existsSync(resolved)) {
        whisperPath = resolved;
        break;
      }
    } catch {
      // not found, try next
    }
  }

  const cacheDir = path.join(os.homedir(), ".cache", "whisper");
  if (fs.existsSync(cacheDir)) {
    const models = fs
      .readdirSync(cacheDir)
      .filter((f) => f.endsWith(".pt"))
      .map((f) => f.replace(".pt", ""));
    if (models.includes("medium")) whisperModel = "medium";
    else if (models.length > 0) whisperModel = models[0];
  }
}

ipcMain.handle("get-screen-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 },
  });
  return sources.map((s) => ({ id: s.id, name: s.name }));
});

ipcMain.handle("get-screen-permission", () => {
  if (process.platform === "darwin") {
    return hasScreenCapturePermission() ? "granted" : "denied";
  }
  return "granted";
});

ipcMain.handle("open-screen-recording-settings", () => {
  // Open the exact macOS System Settings pane for Screen Recording
  shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
});

ipcMain.handle("request-screen-access", () => {
  // Calls CGRequestScreenCaptureAccess() which triggers the native macOS popup
  const granted = hasScreenCapturePermission();
  return granted ? "granted" : "denied";
});

ipcMain.handle("get-config", () => ({
  repoRoot: REPO_ROOT,
  recordingsDir: RECORDINGS_DIR,
  whisperPath,
  whisperModel,
  sandboxScript: path.join(REPO_ROOT, "test-sandbox.sh"),
  shell: process.env.SHELL || "/bin/zsh",
}));

ipcMain.handle("start-terminal", (_event, { cols, rows }) => {
  if (ptyProcess) {
    ptyProcess.kill();
  }

  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-a11y-sandbox-"));
  const configDir = path.join(sandboxDir, "config");
  const stateDir = path.join(sandboxDir, "state");
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  ptyProcess = pty.spawn(process.env.SHELL || "/bin/zsh", [], {
    name: "xterm-256color",
    cols: cols || 120,
    rows: rows || 30,
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      CLAUDE_A11Y_HOOKS_CONFIG_DIR: configDir,
      XDG_STATE_HOME: stateDir,
      TERM: "xterm-256color",
    },
  });

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("terminal-data", data);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("terminal-exit", exitCode);
    }
    ptyProcess = null;
  });

  return { pid: ptyProcess.pid, sandboxDir };
});

ipcMain.on("terminal-input", (_event, data) => {
  if (ptyProcess) {
    ptyProcess.write(data);
  }
});

ipcMain.on("terminal-resize", (_event, { cols, rows }) => {
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
  }
});

ipcMain.handle("run-sandbox", () => {
  if (ptyProcess) {
    ptyProcess.write("./test-sandbox.sh\r");
  }
});

ipcMain.handle("save-recording", async (_event, { buffer, filename }) => {
  const filePath = path.join(RECORDINGS_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return filePath;
});

ipcMain.handle("run-whisper", async (_event, { audioPath }) => {
  if (!whisperPath) {
    return { error: "Whisper not found. Run setup to configure." };
  }

  const baseName = path.basename(audioPath, path.extname(audioPath));
  const jsonPath = path.join(RECORDINGS_DIR, `${baseName}.json`);

  return new Promise((resolve) => {
    const proc = spawn(whisperPath, [
      audioPath,
      "--model", whisperModel,
      "--output_format", "json",
      "--word_timestamps", "True",
      "--language", "en",
      "--no_speech_threshold", "0.5",
      "--output_dir", RECORDINGS_DIR,
    ]);

    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      const wavJson = path.join(RECORDINGS_DIR, `${baseName}.wav.json`);
      let finalJson = jsonPath;
      if (!fs.existsSync(jsonPath) && fs.existsSync(wavJson)) {
        fs.renameSync(wavJson, jsonPath);
        finalJson = jsonPath;
      }

      if (fs.existsSync(finalJson)) {
        const data = JSON.parse(fs.readFileSync(finalJson, "utf-8"));
        resolve({ jsonPath: finalJson, data });
      } else {
        resolve({ error: `Whisper exited with code ${code}. ${stderr.slice(0, 500)}` });
      }
    });

    proc.on("error", (err) => {
      resolve({ error: err.message });
    });
  });
});

ipcMain.handle("generate-report", (_event, { segments, recordingName }) => {
  const filtered = [];
  let filteredCount = 0;

  for (const seg of segments) {
    const noSpeech = seg.no_speech_prob || 0;
    const avgLogprob = seg.avg_logprob || 0;
    const text = (seg.text || "").trim();
    const wordCount = text.split(/\s+/).length;

    if (noSpeech > 0.6) { filteredCount++; continue; }
    if (wordCount <= 1 && avgLogprob < -0.5) { filteredCount++; continue; }

    filtered.push(seg);
  }

  if (filtered.length === 0) {
    return {
      report: `No real speech detected.\n(${segments.length} segments filtered as hallucinations)\n\nThe audio capture may not have recorded system audio.`,
      segments: [],
      filteredCount,
    };
  }

  const lines = [];
  lines.push(`claude-a11y Latency Report`);
  lines.push(`Recording: ${recordingName}`);
  lines.push("");

  const totalDuration = filtered[filtered.length - 1].end || 0;
  lines.push(`Duration: ${totalDuration.toFixed(1)}s`);
  lines.push(`Segments: ${filtered.length} (filtered ${filteredCount} hallucinations)`);
  lines.push("");

  const gaps = [];
  let prevEnd = null;
  let totalSpeech = 0;

  for (let i = 0; i < filtered.length; i++) {
    const seg = filtered[i];
    const start = seg.start || 0;
    const end = seg.end || 0;
    const text = (seg.text || "").trim();
    totalSpeech += end - start;

    let gapStr = "--";
    if (prevEnd !== null) {
      const gap = start - prevEnd;
      if (gap > 0.05) {
        gaps.push(gap);
        gapStr = `${gap.toFixed(2)}s`;
      }
    }

    lines.push(`${(i + 1).toString().padEnd(5)} ${start.toFixed(2).padStart(7)}s ${end.toFixed(2).padStart(7)}s ${gapStr.padStart(8)}  "${text}"`);
    prevEnd = end;
  }

  lines.push("");
  lines.push("Summary:");
  lines.push(`  Announcements: ${filtered.length}`);

  if (gaps.length > 0) {
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    lines.push(`  Avg gap: ${avg.toFixed(2)}s`);
    lines.push(`  Min gap: ${Math.min(...gaps).toFixed(2)}s`);
    lines.push(`  Max gap: ${Math.max(...gaps).toFixed(2)}s`);
  }

  const totalSilence = totalDuration - totalSpeech;
  lines.push(`  Total speech: ${totalSpeech.toFixed(1)}s`);
  lines.push(`  Total silence: ${Math.max(0, totalSilence).toFixed(1)}s`);

  const report = lines.join("\n");
  const reportPath = path.join(RECORDINGS_DIR, `${recordingName}-latency-report.txt`);
  fs.writeFileSync(reportPath, report + "\n");

  return { report, reportPath, segments: filtered, filteredCount };
});

// ── Agent (Computer Use) IPC ──────────────────────────────────────

ipcMain.handle("agent-list-modes", () => listModes());

ipcMain.handle("agent-start", async (_event, { apiKey, modeId, model }) => {
  if (activeAgent && activeAgent.running) {
    return { error: "Agent already running. Stop it first." };
  }

  const modeConfig = getModeConfig(modeId);
  if (!modeConfig) {
    return { error: `Unknown mode: ${modeId}` };
  }

  activeAgent = new AgentLoop({
    apiKey,
    model: model || "claude-sonnet-4-20250514",
    systemPrompt: modeConfig.systemPrompt,
    maxIterations: 50,
    displayWidth: 1280,
    displayHeight: 800,
  });

  activeAgent.on("log", (entry) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("agent-log", entry);
    }
  });

  activeAgent.on("iteration", (n) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("agent-iteration", n);
    }
  });

  activeAgent.on("status", (msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("agent-status", msg);
    }
  });

  activeAgent.on("done", (result) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("agent-done", result);
    }
    activeAgent = null;
  });

  activeAgent.on("error", (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("agent-error", { message: err.message });
    }
    activeAgent = null;
  });

  activeAgent.run(modeConfig.initialMessage).catch((err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("agent-error", { message: err.message });
    }
    activeAgent = null;
  });

  return { started: true, mode: modeConfig.name };
});

ipcMain.handle("agent-stop", () => {
  if (activeAgent) {
    activeAgent.stop();
    activeAgent = null;
    return { stopped: true };
  }
  return { stopped: false, message: "No agent running" };
});
