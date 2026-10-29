#!/usr/bin/env bash
# Envia o app, o harness e o núcleo em C para o servidor e compila o mdsim lá (gcc + OpenMP).
# Rode nesta máquina (Git Bash), na raiz do projeto:
#   bash stress/server/deploy_native.sh [host] [pasta remota]
# Padrão: vid1 (sergio@137.226.169.235, ~/.ssh/config do Windows) e /data/callai/workspace/3dpave.
set -euo pipefail
cd "$(dirname "$0")/../.."

HOST=${1:-vid1}
DIR=${2:-/data/callai/workspace/3dpave}
# o Git Bash usa outro HOME: aponta para a configuração e as chaves do Windows
WIN_SSH=/c/Users/$USERNAME/.ssh
SSH=(ssh -F "$WIN_SSH/config" -i "$WIN_SSH/id_ed25519" -o UserKnownHostsFile="$WIN_SSH/known_hosts")

node build.mjs
echo "→ $HOST:$DIR"
"${SSH[@]}" "$HOST" "mkdir -p '$DIR'"
tar -cf - --exclude='stress/logs' --exclude='stress/results/*' --exclude='*.log' --exclude='native/*.exe' \
  build.mjs marshall_digital_app.html src stress native \
  | "${SSH[@]}" "$HOST" "cd '$DIR' && tar -xf - && sed -i 's/\r\$//' stress/server/*.sh"
"${SSH[@]}" "$HOST" "cd '$DIR' && gcc -O3 -march=native -fopenmp -Wall -Wno-unused-parameter -o native/mdsim native/mdsim.c -lm && echo 'mdsim compilado' && nproc && uptime"
