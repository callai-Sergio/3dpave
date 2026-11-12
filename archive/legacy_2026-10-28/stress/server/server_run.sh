#!/usr/bin/env bash
# Runs a stress grid on the server (Linux), in the background, surviving ssh logout.
# Run from the deploy folder (the one holding marshall_digital_app.html and stress/):
#   bash stress/server/server_run.sh                          # screening, all cores but one
#   bash stress/server/server_run.sh stress/grids/sweep_S1_avc.json --jobs 16
# Afterwards the report and the effects analysis are written next to the results.
set -euo pipefail
cd "$(dirname "$0")/../.."

GRID=${1:-stress/grids/screening.json}; shift || true
NAME=$(basename "$GRID" .json)
mkdir -p stress/results stress/logs

# 1. Node >= 20: use the system one, else a private copy in .node/ (downloaded once from nodejs.org)
NODE=node
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  if [ ! -x .node/bin/node ]; then
    V=v22.11.0; ARCH=$(uname -m); case $ARCH in x86_64) ARCH=x64;; aarch64) ARCH=arm64;; esac
    echo "installing Node $V ($ARCH) into .node/ ..."
    mkdir -p .node && curl -fsSL "https://nodejs.org/dist/$V/node-$V-linux-$ARCH.tar.xz" | tar -xJ -C .node --strip-components=1
  fi
  NODE=$PWD/.node/bin/node
fi
echo "node: $($NODE --version)"

# 2. jobs and memory per job: all cores but one, and no more jobs than RAM allows at ~5 GB each (1000 g runs)
CORES=$(nproc)
MEM_GB=$(awk '/MemTotal/ {printf "%d", $2/1048576}' /proc/meminfo)
JOBS=$(( CORES > 1 ? CORES - 1 : 1 ))
MAXJ=$(( MEM_GB / 5 > 0 ? MEM_GB / 5 : 1 ))
[ "$JOBS" -gt "$MAXJ" ] && JOBS=$MAXJ
MEM_MB=$(( MEM_GB * 1024 * 9 / 10 / JOBS )); [ "$MEM_MB" -gt 8192 ] && MEM_MB=8192
for a in "$@"; do [ "$a" = "--jobs" ] && JOBS=custom; done
EXTRA=("$@"); [ "$JOBS" != custom ] && EXTRA+=(--jobs "$JOBS")
echo "cores $CORES, RAM ${MEM_GB} GB → ${EXTRA[*]}, ${MEM_MB} MB per job"

# 3. golden check first: if the harness does not reproduce the spec here, do not burn hours on the grid
$NODE stress/golden.mjs > stress/logs/golden.log 2>&1 || { echo "golden check FAILED, see stress/logs/golden.log"; cat stress/logs/golden.log; exit 1; }
echo "golden check ok"

# 4. grid in the background (--resume: continues from results already copied or from an interrupted run)
LOG=stress/logs/${NAME}_$(date +%Y%m%d_%H%M%S).log
nohup bash -c "
  '$NODE' stress/run.mjs '$GRID' --resume --timeout 7200 --mem $MEM_MB ${EXTRA[*]} &&
  '$NODE' stress/report.mjs stress/results/$NAME.jsonl --csv stress/results/$NAME.csv > stress/results/$NAME.report.txt &&
  { [ '$NAME' != screening ] || '$NODE' stress/effects.mjs stress/results/$NAME.jsonl > stress/results/$NAME.effects.txt; } &&
  echo ALL DONE
" > "$LOG" 2>&1 &
echo $! > stress/logs/$NAME.pid
ln -sf "$(basename "$LOG")" stress/logs/$NAME.latest.log
echo "running (PID $!). Follow with:  tail -f $PWD/$LOG"
