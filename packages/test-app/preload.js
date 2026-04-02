const { ipcRenderer, shell } = require("electron");
const path = require("path");

function resolveModulePath(pkg, file) {
  try {
    const pkgJson = require.resolve(`${pkg}/package.json`);
    return path.join(path.dirname(pkgJson), file);
  } catch {
    return null;
  }
}

window.modulePaths = {
  xtermCss: resolveModulePath("xterm", "css/xterm.css"),
};

window.api = {
  getConfig: () => ipcRenderer.invoke("get-config"),
  getScreenSources: () => ipcRenderer.invoke("get-screen-sources"),
  getScreenPermission: () => ipcRenderer.invoke("get-screen-permission"),
  openScreenRecordingSettings: () => ipcRenderer.invoke("open-screen-recording-settings"),
  requestScreenAccess: () => ipcRenderer.invoke("request-screen-access"),
  startTerminal: (opts) => ipcRenderer.invoke("start-terminal", opts),
  sendInput: (data) => ipcRenderer.send("terminal-input", data),
  resizeTerminal: (size) => ipcRenderer.send("terminal-resize", size),
  runSandbox: () => ipcRenderer.invoke("run-sandbox"),
  saveRecording: (opts) => ipcRenderer.invoke("save-recording", opts),
  runWhisper: (opts) => ipcRenderer.invoke("run-whisper", opts),
  generateReport: (opts) => ipcRenderer.invoke("generate-report", opts),

  onTerminalData: (callback) => {
    ipcRenderer.on("terminal-data", (_event, data) => callback(data));
  },
  onTerminalExit: (callback) => {
    ipcRenderer.on("terminal-exit", (_event, code) => callback(code));
  },

  agentListModes: () => ipcRenderer.invoke("agent-list-modes"),
  agentStart: (opts) => ipcRenderer.invoke("agent-start", opts),
  agentStop: () => ipcRenderer.invoke("agent-stop"),
  onAgentLog: (callback) => {
    ipcRenderer.on("agent-log", (_event, entry) => callback(entry));
  },
  onAgentIteration: (callback) => {
    ipcRenderer.on("agent-iteration", (_event, n) => callback(n));
  },
  onAgentStatus: (callback) => {
    ipcRenderer.on("agent-status", (_event, msg) => callback(msg));
  },
  onAgentDone: (callback) => {
    ipcRenderer.on("agent-done", (_event, result) => callback(result));
  },
  onAgentError: (callback) => {
    ipcRenderer.on("agent-error", (_event, err) => callback(err));
  },
};
