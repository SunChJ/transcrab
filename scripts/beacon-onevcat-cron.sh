#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Ensure deps present for fetch (node built-in) and avoid npm install in cron.
# Compare current homepage sources vs last snapshot.
out=$(npm -s run beacon:onevcat || true)

# If script failed hard, notify via stderr and exit non-zero
if echo "$out" | grep -q '"ok": false'; then
  echo "$out"
  exit 1
fi

# Parse diff counts (cheap grep; output is JSON)
added=$(echo "$out" | sed -n 's/.*"addedCount": \([0-9][0-9]*\).*/\1/p' | head -n 1)
removed=$(echo "$out" | sed -n 's/.*"removedCount": \([0-9][0-9]*\).*/\1/p' | head -n 1)
x_added=$(echo "$out" | sed -n 's/.*"xHandlesAddedCount": \([0-9][0-9]*\).*/\1/p' | head -n 1)
x_removed=$(echo "$out" | sed -n 's/.*"xHandlesRemovedCount": \([0-9][0-9]*\).*/\1/p' | head -n 1)

added=${added:-0}
removed=${removed:-0}
x_added=${x_added:-0}
x_removed=${x_removed:-0}

if [ "$added" != "0" ] || [ "$removed" != "0" ] || [ "$x_added" != "0" ] || [ "$x_removed" != "0" ]; then
  echo "$out"
  # Update snapshot only when changes detected
  npm -s run beacon:onevcat:update >/dev/null
else
  # no output = silent ok
  :
fi
