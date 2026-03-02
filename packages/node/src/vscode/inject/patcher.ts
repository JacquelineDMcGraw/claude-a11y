/**
 * Workbench patcher — injects our accessibility observer script into
 * Cursor/VS Code's main renderer HTML.
 *
 * Same technique used by "Custom CSS and JS Loader" and "Apc Customize UI++".
 * Patches workbench.html to include a <script> tag that loads chat-a11y.js.
 * Also adds our TrustedTypes policy name to the CSP so the script can
 * perform DOM operations under Cursor's strict Trusted Types enforcement.
 * Requires a restart of Cursor to take effect.
 */

import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";

const MARKER_START = "<!-- claude-a11y-start -->";
const MARKER_END = "<!-- claude-a11y-end -->";
const TRUSTED_TYPE_POLICY = "claudeA11y";

// Pre-rename values that may exist in workbench.html from earlier versions
const LEGACY_MARKER_START = "<!-- claude-accessible-start -->";
const LEGACY_MARKER_END = "<!-- claude-accessible-end -->";
const LEGACY_TRUSTED_TYPE_POLICY = "claudeAccessible";

/**
 * Find the workbench.html file in the app installation.
 */
function findWorkbenchHtml(): string | null {
  const appRoot = vscode.env.appRoot;

  // Try known paths for VS Code / Cursor
  const candidates = [
    path.join(
      appRoot,
      "out",
      "vs",
      "code",
      "electron-sandbox",
      "workbench",
      "workbench.html"
    ),
    path.join(
      appRoot,
      "out",
      "vs",
      "code",
      "electron-browser",
      "workbench",
      "workbench.html"
    ),
    path.join(
      appRoot,
      "out",
      "vs",
      "workbench",
      "workbench.desktop.html"
    ),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Get the path to our chat-a11y.js script.
 */
function getScriptPath(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, "media", "chat-a11y.js");
}

/**
 * Check if the injection is already installed.
 */
export function isInstalled(): boolean {
  const htmlPath = findWorkbenchHtml();
  if (!htmlPath) return false;

  try {
    const content = fs.readFileSync(htmlPath, "utf-8");
    return (
      content.includes(MARKER_START) ||
      content.includes(LEGACY_MARKER_START)
    );
  } catch {
    return false;
  }
}

/**
 * Install the accessibility injection into Cursor/VS Code.
 */
export async function install(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const htmlPath = findWorkbenchHtml();
  if (!htmlPath) {
    vscode.window.showErrorMessage(
      "Could not find Cursor's workbench.html. " +
        "Make sure you're running this inside Cursor or VS Code."
    );
    return false;
  }

  const scriptPath = getScriptPath(context);
  if (!fs.existsSync(scriptPath)) {
    vscode.window.showErrorMessage(
      "chat-a11y.js not found in the extension. Try reinstalling the extension."
    );
    return false;
  }

  try {
    let html = fs.readFileSync(htmlPath, "utf-8");

    // Remove any existing injection first
    html = removeInjection(html);

    // Copy chat-a11y.js into the same directory as workbench.html
    // so it loads via relative path (avoids file:// CSP issues)
    const destScript = path.join(path.dirname(htmlPath), "chat-a11y.js");
    fs.copyFileSync(scriptPath, destScript);

    // Add our TrustedTypes policy name to the CSP so our script
    // can create DOM elements without Trusted Types violations
    html = addTrustedTypePolicy(html);

    // Inject before </html>
    const injection = `
${MARKER_START}
<script src="./chat-a11y.js"></script>
${MARKER_END}`;

    html = html.replace("</html>", injection + "\n</html>");

    // Create a backup
    const backupPath = htmlPath + ".ca11y-backup";
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(htmlPath, backupPath);
    }

    // Write the patched file
    fs.writeFileSync(htmlPath, html, "utf-8");

    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes("EACCES") || msg.includes("permission denied")) {
      vscode.window.showErrorMessage(
        "Permission denied writing to Cursor's files. " +
          "Try running: sudo chown -R $(whoami) " +
          JSON.stringify(path.dirname(htmlPath))
      );
    } else {
      vscode.window.showErrorMessage(
        "Failed to patch workbench.html: " + msg
      );
    }
    return false;
  }
}

/**
 * Uninstall the accessibility injection.
 */
export async function uninstall(): Promise<boolean> {
  const htmlPath = findWorkbenchHtml();
  if (!htmlPath) return false;

  try {
    // Try restoring from backup first
    const backupPath = htmlPath + ".ca11y-backup";
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, htmlPath);
      fs.unlinkSync(backupPath);
      return true;
    }

    // Otherwise just remove our markers
    let html = fs.readFileSync(htmlPath, "utf-8");
    html = removeInjection(html);
    fs.writeFileSync(htmlPath, html, "utf-8");
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      "Failed to remove injection: " + msg
    );
    return false;
  }
}

/**
 * Add our TrustedTypes policy name to the CSP meta tag.
 */
function addTrustedTypePolicy(html: string): string {
  // Remove legacy policy name if present
  html = html.replace(
    new RegExp(`\\s*${LEGACY_TRUSTED_TYPE_POLICY}\\n?`, "g"),
    ""
  );

  if (html.includes(TRUSTED_TYPE_POLICY)) {
    return html;
  }

  // Find the trusted-types line and append our policy name
  const ttRegex = /(trusted-types\s*\n)([\s\S]*?)(;)/;
  const match = html.match(ttRegex);
  if (match) {
    html = html.replace(
      ttRegex,
      `$1$2\t\t\t\t\t${TRUSTED_TYPE_POLICY}\n\t\t\t\t$3`
    );
  }

  return html;
}

function removeInjection(html: string): string {
  // Strip current markers
  const startIdx = html.indexOf(MARKER_START);
  const endIdx = html.indexOf(MARKER_END);
  if (startIdx !== -1 && endIdx !== -1) {
    html =
      html.substring(0, startIdx) +
      html.substring(endIdx + MARKER_END.length);
  }

  // Strip legacy markers from pre-rename versions
  const legacyStart = html.indexOf(LEGACY_MARKER_START);
  const legacyEnd = html.indexOf(LEGACY_MARKER_END);
  if (legacyStart !== -1 && legacyEnd !== -1) {
    html =
      html.substring(0, legacyStart) +
      html.substring(legacyEnd + LEGACY_MARKER_END.length);
  }

  // Remove both current and legacy TrustedTypes policy names from CSP
  html = html.replace(
    new RegExp(`\\s*${TRUSTED_TYPE_POLICY}\\n?`, "g"),
    ""
  );
  html = html.replace(
    new RegExp(`\\s*${LEGACY_TRUSTED_TYPE_POLICY}\\n?`, "g"),
    ""
  );

  return html;
}
