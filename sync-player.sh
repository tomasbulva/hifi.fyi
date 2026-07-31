#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────
# sync-player.sh — pull hifi project from OpenClaw to local
# Usage:  ./sync-player.sh [--watch]
#   --watch  keep running; sync only when remote files change
# ─────────────────────────────────────────────────

REMOTE_HOST="${OPENCLAW_HOST:-openclaw}"
REMOTE_PATH="/root/.openclaw/agents/web_developer/workspace/projects/navidrome-web-player/"
LOCAL_PATH="${LOCAL_PATH:-.}"

EXCLUDES=(
  --exclude 'node_modules/'
  --exclude 'dist/'
  --exclude '.git/'
  --exclude '.DS_Store'
  --exclude 'package-lock.json'
)

do_sync() {
  echo "⟳ Syncing ${REMOTE_HOST}:${REMOTE_PATH} → ${LOCAL_PATH} ($(date +%H:%M:%S))"
  rsync -avz --delete "${EXCLUDES[@]}" \
    "${REMOTE_HOST}:${REMOTE_PATH}" \
    "${LOCAL_PATH}"
  echo "✓ Done."
}

mkdir -p "${LOCAL_PATH}"
do_sync

if [[ "${1:-}" != "--watch" ]]; then
  exit 0
fi

# ── Watch mode ──
# Poll the remote tree every 5s using a checksum.
# Only re-sync when the hash changes. No extra dependencies needed.

echo ""
echo "👀 Watching for changes — Ctrl+C to stop"

LAST_HASH=""
while true; do
  NEW_HASH=$(ssh "${REMOTE_HOST}" \
    "find '${REMOTE_PATH}' -type f \
      -not -path '*/node_modules/*' \
      -not -path '*/dist/*' \
      -not -path '*/.git/*' \
      -exec sha1sum {} \; 2>/dev/null | sort | sha1sum" 2>/dev/null || echo "")

  if [[ "${NEW_HASH}" != "${LAST_HASH}" && -n "${NEW_HASH}" ]]; then
    LAST_HASH="${NEW_HASH}"
    do_sync
  fi

  sleep 5
done
