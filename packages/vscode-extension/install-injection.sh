#!/bin/bash
# Install chat-a11y.js into Cursor's workbench directory
# Must be run with: sudo bash install-injection.sh

set -e

WORKBENCH_DIR="/Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench"
WORKBENCH_HTML="$WORKBENCH_DIR/workbench.html"
SCRIPT_SRC="$(dirname "$0")/media/chat-a11y.js"
BACKUP="$WORKBENCH_HTML.ca11y-backup"

if [ ! -f "$WORKBENCH_HTML" ]; then
  echo "ERROR: Cannot find $WORKBENCH_HTML"
  exit 1
fi

if [ ! -f "$SCRIPT_SRC" ]; then
  echo "ERROR: Cannot find $SCRIPT_SRC"
  exit 1
fi

# Backup if no backup exists
if [ ! -f "$BACKUP" ]; then
  echo "Creating backup at $BACKUP"
  cp "$WORKBENCH_HTML" "$BACKUP"
fi

# Copy updated script
echo "Copying chat-a11y.js..."
cp "$SCRIPT_SRC" "$WORKBENCH_DIR/chat-a11y.js"

# Add TrustedTypes policy if not already present
if ! grep -q "claudeAccessible" "$WORKBENCH_HTML"; then
  echo "Adding TrustedTypes policy to CSP..."
  sed -i '' 's/shikiWorkerFactory/shikiWorkerFactory\n\t\t\t\t\tclaudeAccessible/' "$WORKBENCH_HTML"
fi

# Add script tag if not already present
if ! grep -q "chat-a11y.js" "$WORKBENCH_HTML"; then
  echo "Adding script tag to workbench.html..."
  sed -i '' 's|</html>|<!-- claude-accessible-start -->\n<script src="./chat-a11y.js"></script>\n<!-- claude-accessible-end -->\n</html>|' "$WORKBENCH_HTML"
fi

echo ""
echo "Done! Restart Cursor for changes to take effect."
echo "To undo: sudo cp '$BACKUP' '$WORKBENCH_HTML' && sudo rm '$WORKBENCH_DIR/chat-a11y.js'"
