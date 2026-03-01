#!/bin/bash
# Mock claude binary for one-shot text output mode

# Handle --version flag
for arg in "$@"; do
  if [ "$arg" = "--version" ]; then
    echo "mock-claude 1.0.0"
    exit 0
  fi
done

printf '\x1b[1mHello\x1b[0m from Claude!\n'
printf 'This is \x1b[32mgreen text\x1b[0m and \x1b[31mred text\x1b[0m.\n'
echo 'Plain text line.'
