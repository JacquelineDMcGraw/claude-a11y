# Security

## Reporting vulnerabilities

If you find a security vulnerability in this project, do not file a public issue. Instead, contact the maintainer directly at the email address listed on the repository owner's GitHub profile.

Include:

- A description of the vulnerability.
- Steps to reproduce it.
- The potential impact.
- A suggested fix, if you have one.

You will receive a response within 7 days. If the vulnerability is confirmed, a fix will be released and you will be credited (unless you prefer to remain anonymous).

## Security considerations by package

### Chrome extension

The Chrome extension injects JavaScript into the claude.ai page via a content script. The injected script (chat-a11y.js) runs in the main world of the page, meaning it has access to the same context as claude.ai's own JavaScript.

The extension:

- Does not read, store, or transmit any user data.
- Does not make network requests.
- Does not access cookies, localStorage, or session storage.
- Only modifies DOM attributes (ARIA roles, labels) and inserts visually-hidden spans.

The extension requests two permissions: `activeTab` (to check if the current tab is claude.ai) and `scripting` (to execute stat-checking functions from the popup). No host permissions are requested.

### VS Code / Cursor extension

The Cursor DOM injection feature modifies `workbench.html` to load chat-a11y.js. This requires file system write access to the Cursor installation directory. The extension:

- Creates a backup of the original file before patching.
- Only appends a script tag between clearly marked comment boundaries.
- Can be fully reverted with the "Disable Chat Accessibility" command.

### Claude Desktop (DevTools method)

The Claude Desktop injection method requires launching the app with `CLAUDE_DEV_TOOLS=detach` and pasting JavaScript into the DevTools console. This is inherently a manual, per-session operation. The script does not persist across app restarts.

This method requires the user to explicitly open DevTools and paste code. It cannot be triggered remotely or by a third party.

### CLI

The CLI spawns the `claude` binary as a child process. It does not modify the Claude Code installation. It reads stdout and stderr from the subprocess and writes sanitized output to its own stdout and stderr. No data is sent to any external service.
