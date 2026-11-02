#!/usr/bin/env bash
# One-step launcher: installs Node.js if needed, installs dependencies, starts the app.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "Installing Node.js 22 (needs your password)..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi
if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ]; then npm install; fi
# Electron downloads its program in a separate step that sometimes gets skipped or fails.
if [ ! -f node_modules/electron/path.txt ]; then
  echo "Downloading Electron..."
  node node_modules/electron/install.js
fi
npm run dev -- "$@" || { echo; echo "If it failed with a sandbox error, run: ./run.sh --noSandbox"; exit 1; }
