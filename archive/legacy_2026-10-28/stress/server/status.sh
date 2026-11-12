#!/usr/bin/env bash
# Progress of a grid running on the server:  bash stress/server/status.sh [screening]
cd "$(dirname "$0")/../.."
NAME=${1:-screening}
PID=$(cat stress/logs/$NAME.pid 2>/dev/null || true)
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then echo "$NAME: running (PID $PID)"; else echo "$NAME: not running"; fi
LOG=stress/logs/$NAME.latest.log
[ -e "$LOG" ] || { echo "no log yet"; exit 0; }
head -1 "$LOG"
echo "finished: $(grep -c '^\[' "$LOG")"
grep -oE '^\[[0-9]+/[0-9]+ [0-9]+s\] [a-zA-Z]+' "$LOG" | awk '{print $3}' | sort | uniq -c | sed 's/^/  /'
tail -3 "$LOG"
