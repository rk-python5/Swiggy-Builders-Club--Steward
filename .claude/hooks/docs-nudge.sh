#!/usr/bin/env bash
# Counts every tool action Claude Code takes in this project. Every 20 of
# them, injects a reminder to update DECISIONS.md and CLAUDE.md — hooks are
# shell commands, they can't write the semantic content themselves, so this
# nudges the model to do it instead of trying to fake it here.
set -euo pipefail

STATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/hooks/.state"
COUNT_FILE="$STATE_DIR/action-count"
THRESHOLD=20

mkdir -p "$STATE_DIR"
[ -f "$COUNT_FILE" ] || echo 0 > "$COUNT_FILE"

count=$(($(cat "$COUNT_FILE") + 1))

if [ "$count" -ge "$THRESHOLD" ]; then
  echo 0 > "$COUNT_FILE"
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "[docs-nudge hook] 20 tool actions have passed since the last check. Before continuing, review whether anything since then belongs in DECISIONS.md (a new choice made, an alternative ruled out, a constraint discovered) or CLAUDE.md (setup/commands/architecture changed). Update whichever files need it, or note briefly that nothing changed, then continue with the task."
  }
}
EOF
else
  echo "$count" > "$COUNT_FILE"
fi
