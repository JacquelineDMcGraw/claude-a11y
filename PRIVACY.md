# Privacy Policy

**Claude Accessible** (the Chrome extension, VS Code extension, and CLI tool)

**Last updated:** March 2, 2026

## Data collection

This extension does not collect, transmit, or store any personal data. It does not communicate with any external servers.

## What the extension does

The extension modifies the visual presentation of claude.ai chat responses in your browser to make them accessible to screen readers. All processing happens locally in your browser.

## Local storage

The extension stores the following data in your browser's local storage (via `chrome.storage.local`):

- Your preference for whether the extension is enabled or disabled
- Anonymous session counts (number of times the extension has run) for optional feedback export

This data never leaves your browser. It is not transmitted to any server.

## Feedback export

The extension popup includes an "Export feedback data" button that copies anonymous usage statistics to your clipboard. This action is entirely manual and opt-in. The data is only shared if you choose to paste it into a GitHub issue.

## Permissions

- **activeTab**: Injects the accessibility script into claude.ai tabs
- **scripting**: Injects content scripts to transform chat responses
- **storage**: Stores your enabled/disabled preference locally
- **Host access to claude.ai**: The extension only operates on claude.ai pages

## Third-party services

This extension does not use any third-party analytics, tracking, advertising, or data collection services.

## Contact

If you have questions about this privacy policy, open an issue at:
https://github.com/JacquelineDMcGraw/claude-a11y/issues
