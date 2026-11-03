#!/bin/bash
# macOS: double-click to start the Oddlin quiz server and open it in the browser.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download it from https://nodejs.org and run this file again."
  read -r -p "Press Enter to close."
  exit 1
fi

node server.js --open
