#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d ".venv-mission" ]; then
  python3 -m venv .venv-mission
fi

.venv-mission/bin/python -m ensurepip --upgrade >/dev/null 2>&1 || true
.venv-mission/bin/python -m pip install --upgrade pip setuptools wheel
.venv-mission/bin/python -m pip install -r requirements.txt
.venv-mission/bin/python -m pip install pytest pytest-asyncio

if [ -f "frontend/package.json" ] && [ ! -d "frontend/node_modules" ]; then
  npm --prefix frontend install
fi

if [ -f "mini/package.json" ] && [ ! -d "mini/node_modules" ]; then
  npm --prefix mini install
fi
