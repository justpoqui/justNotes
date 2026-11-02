#!/usr/bin/env bash
# One-step launcher: installs Node.js if needed, installs dependencies, starts the app.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "Installing Node.js 22 (needs your password)..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi
[ -d node_modules ] || npm install
npm run dev -- "$@" || { echo; echo "If it failed with a sandbox error, run: ./run.sh --noSandbox"; exit 1; }
