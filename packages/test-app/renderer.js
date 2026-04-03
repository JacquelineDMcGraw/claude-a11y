/* global api, modulePaths */
const { Terminal } = require("xterm");
const { FitAddon } = require("xterm-addon-fit");

let term;
let fitAddon;
let config;

// Recording state
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingStartTime = null;
let lastRecordingPath = null;
let audioStream = null;

// Agent state
let agentRunning = false;

// ── DOM refs ───────────────────────────────────────────────────────

const logContainer = document.getElementById("log-container");
const statusEl = document.getElementById("status");
const footerInfo = document.getElementById("footer-info");
const footerWhisper = document.getElementById("footer-whisper");
const reportContainer = document.getElementById("report-container");
const reportContent = document.getElementById("report-content");
const btnSandbox = document.getElementById("btn-sandbox");
const btnRecord = document.getElementById("btn-record");
const btnAnalyze = document.getElementById("btn-analyze");

const tabManual = document.getElementById("tab-manual");
const tabAgent = document.getElementById("tab-agent");
const panelManual = document.getElementById("panel-manual");
const panelAgent = document.getElementById("panel-agent");

const agentApiKey = document.getElementById("agent-api-key");
const agentModel = document.getElementById("agent-model");
const agentMode = document.getElementById("agent-mode");
const agentModeDesc = document.getElementById("agent-mode-desc");
const agentLogEl = document.getElementById("agent-log");
const agentStatusEl = document.getElementById("agent-status");
const btnAgentStart = document.getElementById("btn-agent-start");
const btnAgentStop = document.getElementById("btn-agent-stop");

// ── Tab switching ──────────────────────────────────────────────────

function switchTab(tabId) {
  const isManual = tabId === "manual";
  tabManual.classList.toggle("active", isManual);
  tabManual.setAttribute("aria-selected", String(isManual));
  tabAgent.classList.toggle("active", !isManual);
  tabAgent.setAttribute("aria-selected", String(!isManual));
  panelManual.classList.toggle("active", isManual);
  panelAgent.classList.toggle("active", !isManual);

  if (isManual && fitAddon) {
    setTimeout(() => fitAddon.fit(), 50);
  }
}

tabManual.addEventListener("click", () => switchTab("manual"));
tabAgent.addEventListener("click", () => switchTab("agent"));

// ── Mode descriptions ──────────────────────────────────────────────

const modeDescriptions = {
  "test-runner": "Runs the full test sandbox automatically, validates TTS and earcon output, captures results.",
  "dev-agent": "Builds the project, runs tests, finds failures, fixes code, rebuilds, and repeats until all tests pass.",
  "a11y-auditor": "Evaluates TTS quality, earcon appropriateness, timing, and information clarity. Produces an accessibility audit report.",
};

agentMode.addEventListener("change", () => {
  agentModeDesc.textContent = modeDescriptions[agentMode.value] || "";
});

// ── Sidebar log (shared by both tabs) ──────────────────────────────

function addLog(level, message) {
  const entry = document.createElement("div");
  entry.className = `log-entry ${level}`;
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  const prefix = `[${level.toUpperCase()}]`;
  entry.textContent = `${time} ${prefix} ${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

function parseTerminalForLogs(data) {
  const lines = data.split("\n");
  for (const line of lines) {
    const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
    if (!clean) continue;

    if (clean.includes("[PASS]")) {
      addLog("pass", clean.replace(/.*\[PASS\]\s*/, ""));
    } else if (clean.includes("[FAIL]")) {
      addLog("fail", clean.replace(/.*\[FAIL\]\s*/, ""));
    } else if (clean.includes("[SKIP]")) {
      addLog("skip", clean.replace(/.*\[SKIP\]\s*/, ""));
    } else if (clean.includes("[HEAR]")) {
      addLog("hear", clean.replace(/.*\[HEAR\]\s*/, ""));
    } else if (clean.includes("[INFO]")) {
      addLog("info", clean.replace(/.*\[INFO\]\s*/, ""));
    }
  }
}

// ── Terminal init ──────────────────────────────────────────────────

async function initTerminal() {
  if (window.modulePaths && window.modulePaths.xtermCss) {
    document.getElementById("xterm-css").href = window.modulePaths.xtermCss;
  }

  config = await api.getConfig();

  footerWhisper.textContent = config.whisperPath
    ? `Whisper: ${config.whisperModel} (${config.whisperPath})`
    : "Whisper: not found";

  term = new Terminal({
    fontFamily: '"SF Mono", Menlo, Monaco, "Courier New", monospace',
    fontSize: 14,
    theme: {
      background: "#1a1a2e",
      foreground: "#e0e0e0",
      cursor: "#4fc3f7",
      selectionBackground: "#4fc3f744",
    },
    cursorBlink: true,
    allowProposedApi: true,
    screenReaderMode: true,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const container = document.getElementById("terminal-container");
  term.open(container);
  fitAddon.fit();

  const { cols, rows } = term;
  await api.startTerminal({ cols, rows });

  term.onData((data) => api.sendInput(data));

  api.onTerminalData((data) => {
    term.write(data);
    parseTerminalForLogs(data);
  });

  api.onTerminalExit((code) => {
    addLog("info", `Terminal exited with code ${code}`);
    footerInfo.textContent = "Terminal exited";
  });

  new ResizeObserver(() => {
    fitAddon.fit();
    api.resizeTerminal({ cols: term.cols, rows: term.rows });
  }).observe(container);

  footerInfo.textContent = `Terminal ready (${cols}x${rows})`;
  addLog("info", "Terminal started. Ready to test.");
}

// ── Recording ──────────────────────────────────────────────────────

async function startRecording() {
  try {
    addLog("info", "Requesting screen capture...");

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { max: 1920 },
        height: { max: 1080 },
        frameRate: { max: 30 },
      },
      audio: true,
    });

    addLog("info", `Capturing screen (${stream.getVideoTracks().length} video, ${stream.getAudioTracks().length} audio tracks)`);

    audioStream = stream;
    recordedChunks = [];

    mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9,opus",
      videoBitsPerSecond: 2500000,
      audioBitsPerSecond: 128000,
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const buffer = await blob.arrayBuffer();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `${timestamp}.webm`;

      lastRecordingPath = await api.saveRecording({
        buffer: new Uint8Array(buffer),
        filename,
      });

      addLog("pass", `Recording saved: ${filename}`);
      btnAnalyze.disabled = false;
      statusEl.textContent = "Recording saved";
      statusEl.className = "status";

      if (audioStream) {
        audioStream.getTracks().forEach((t) => t.stop());
        audioStream = null;
      }
    };

    mediaRecorder.start(1000);
    isRecording = true;
    recordingStartTime = Date.now();

    btnRecord.classList.add("active");
    btnRecord.textContent = "Stop";
    statusEl.textContent = "Recording...";
    statusEl.className = "status recording";
    addLog("info", "Recording started (screen + system audio)");

    updateRecordingTimer();
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")) {
      addLog("fail", "Screen recording permission not active yet.");
      addLog("info", "If you just granted permission, quit this app completely and relaunch it.");
      statusEl.textContent = "Relaunch app after granting permission";
    } else {
      addLog("fail", `Recording failed: ${msg}`);
      statusEl.textContent = `Error: ${msg}`;
    }
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  isRecording = false;
  btnRecord.classList.remove("active");
  btnRecord.textContent = "Record";
  addLog("info", "Recording stopped. Processing...");
}

function updateRecordingTimer() {
  if (!isRecording) return;
  const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  const min = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const sec = (elapsed % 60).toString().padStart(2, "0");
  statusEl.textContent = `Recording ${min}:${sec}`;
  requestAnimationFrame(() => setTimeout(updateRecordingTimer, 500));
}

async function analyzeRecording() {
  if (!lastRecordingPath) {
    addLog("fail", "No recording to analyze");
    return;
  }

  addLog("info", "Extracting audio and running Whisper...");
  btnAnalyze.disabled = true;
  footerInfo.textContent = "Analyzing...";

  const result = await api.runWhisper({ audioPath: lastRecordingPath });

  if (result.error) {
    addLog("fail", `Analysis failed: ${result.error}`);
    footerInfo.textContent = "Analysis failed";
    btnAnalyze.disabled = false;
    return;
  }

  addLog("pass", "Whisper transcription complete");

  const recordingName = lastRecordingPath.split("/").pop().replace(/\.[^.]+$/, "");
  const reportResult = await api.generateReport({
    segments: result.data.segments || [],
    recordingName,
  });

  reportContent.textContent = reportResult.report;
  reportContainer.classList.add("visible");

  if (reportResult.reportPath) {
    addLog("pass", `Latency report saved: ${reportResult.reportPath.split("/").pop()}`);
  }

  footerInfo.textContent = "Analysis complete";
  btnAnalyze.disabled = false;
}

// ── Agent (Computer Use) ───────────────────────────────────────────

function addAgentLog(level, message) {
  const entry = document.createElement("div");
  entry.className = `agent-log-entry ${level}`;
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  const prefix = level === "assistant" ? "[Claude]" : `[${level.toUpperCase()}]`;

  const maxLen = 500;
  const display = message.length > maxLen ? message.slice(0, maxLen) + "..." : message;
  entry.textContent = `${time} ${prefix} ${display}`;
  agentLogEl.appendChild(entry);
  agentLogEl.scrollTop = agentLogEl.scrollHeight;
}

function persistApiKey(key) {
  try { localStorage.setItem("claude-a11y-agent-key", key); } catch {}
}
function loadApiKey() {
  try { return localStorage.getItem("claude-a11y-agent-key") || ""; } catch { return ""; }
}

agentApiKey.value = loadApiKey();

btnAgentStart.addEventListener("click", async () => {
  const key = agentApiKey.value.trim();
  if (!key) {
    addAgentLog("error", "Enter your Anthropic API key first.");
    agentApiKey.focus();
    return;
  }

  persistApiKey(key);
  btnAgentStart.disabled = true;
  btnAgentStop.disabled = false;
  agentRunning = true;
  agentStatusEl.textContent = "Starting...";
  agentStatusEl.className = "status agent-active";
  agentLogEl.innerHTML = "";

  addAgentLog("info", `Starting ${agentMode.options[agentMode.selectedIndex].text}...`);

  const result = await api.agentStart({
    apiKey: key,
    modeId: agentMode.value,
    model: agentModel.value,
  });

  if (result.error) {
    addAgentLog("error", result.error);
    btnAgentStart.disabled = false;
    btnAgentStop.disabled = true;
    agentRunning = false;
    agentStatusEl.textContent = "Error";
    agentStatusEl.className = "status";
  }
});

btnAgentStop.addEventListener("click", async () => {
  addAgentLog("info", "Stopping agent...");
  await api.agentStop();
  btnAgentStart.disabled = false;
  btnAgentStop.disabled = true;
  agentRunning = false;
  agentStatusEl.textContent = "Stopped";
  agentStatusEl.className = "status";
});

api.onAgentLog((entry) => {
  addAgentLog(entry.level, entry.message);
  addLog(entry.level === "error" ? "fail" : "info", `[Agent] ${entry.message.slice(0, 200)}`);
});

api.onAgentIteration((n) => {
  agentStatusEl.textContent = `Iteration ${n}`;
  footerInfo.textContent = `Agent: iteration ${n}`;
});

api.onAgentStatus((msg) => {
  agentStatusEl.textContent = msg;
});

api.onAgentDone((result) => {
  addAgentLog("info", `Agent finished: ${result.reason} after ${result.iterations} iterations`);
  addLog("info", `Agent finished: ${result.reason} (${result.iterations} iterations)`);
  btnAgentStart.disabled = false;
  btnAgentStop.disabled = true;
  agentRunning = false;
  agentStatusEl.textContent = `Done (${result.reason})`;
  agentStatusEl.className = "status";
  footerInfo.textContent = `Agent done: ${result.reason}`;
});

api.onAgentError((err) => {
  addAgentLog("error", `Agent error: ${err.message}`);
  addLog("fail", `Agent error: ${err.message}`);
  btnAgentStart.disabled = false;
  btnAgentStop.disabled = true;
  agentRunning = false;
  agentStatusEl.textContent = "Error";
  agentStatusEl.className = "status";
});

// ── Manual tab button handlers ─────────────────────────────────────

btnSandbox.addEventListener("click", () => {
  api.runSandbox();
  addLog("info", "Launched test-sandbox.sh");
  footerInfo.textContent = "Sandbox running";
});

btnRecord.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

btnAnalyze.addEventListener("click", analyzeRecording);

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.metaKey && e.key === "r") {
    e.preventDefault();
    btnRecord.click();
  }
  if (e.metaKey && e.shiftKey && e.key === "A") {
    e.preventDefault();
    if (!btnAnalyze.disabled) btnAnalyze.click();
  }
});

// ── Init ───────────────────────────────────────────────────────────

initTerminal();
