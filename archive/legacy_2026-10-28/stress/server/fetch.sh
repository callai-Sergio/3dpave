#!/usr/bin/env bash
# Run on this computer: copies the server's results and logs back into stress/results/server/.
#   bash stress/server/fetch.sh user@host [remote_dir]
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=${1:?usage: fetch.sh user@host [remote_dir]}
DIR=${2:-/data/callai/workspace/3dpave_stress}
mkdir -p stress/results/server
ssh "$HOST" "cd '$DIR/stress' && tar -cf - results logs" | tar -xf - -C stress/results/server
ls -la stress/results/server/results
