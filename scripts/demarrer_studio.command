#!/bin/zsh
set -eu
studio_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$studio_root"
if [[ ! -x .venv/bin/python ]]; then
  print 'Le moteur Python du Studio doit être installé avec scripts/installer_studio.command.'
  exit 1
fi
exec .venv/bin/python -m uvicorn app.server:app --host 127.0.0.1 --port "${REVELATION_PORT:-8848}"
