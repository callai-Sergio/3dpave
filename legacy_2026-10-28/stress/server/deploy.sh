#!/usr/bin/env bash
# Run on this computer (Git Bash). Copies the app + harness to the server and starts a grid there.
#   bash stress/server/deploy.sh user@host                                  # screening into the default folder
#   bash stress/server/deploy.sh user@host /data/callai/workspace/3dpave_stress stress/grids/sweep_S1_avc.json
# Results already in stress/results/ are copied too, so the server resumes instead of starting over.
set -euo pipefail
cd "$(dirname "$0")/../.."

HOST=${1:?usage: deploy.sh user@host [remote_dir] [grid.json] [run options...]}
DIR=${2:-/data/callai/workspace/3dpave_stress}
GRID=${3:-stress/grids/screening.json}
shift $(( $# < 3 ? $# : 3 ))

echo "→ $HOST:$DIR"
ssh "$HOST" "mkdir -p '$DIR'"
tar -cf - --exclude='stress/logs' --exclude='*.log' marshall_digital_app.html stress \
  | ssh "$HOST" "cd '$DIR' && tar -xf - && sed -i 's/\r\$//' stress/server/*.sh"
ssh "$HOST" "cd '$DIR' && bash stress/server/server_run.sh '$GRID' $*"
echo
echo "status:  ssh $HOST 'bash $DIR/stress/server/status.sh $(basename "$GRID" .json)'"
echo "fetch:   bash stress/server/fetch.sh $HOST $DIR"
