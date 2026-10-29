#!/usr/bin/env bash
# Roda o pipeline no servidor (Linux). Uso, na pasta "Aggregate types":
#   bash scripts/rodar_servidor.sh                 # tudo, em segundo plano, com log
#   bash scripts/rodar_servidor.sh --amostra       # só o teste de segmentação da CT
#   bash scripts/rodar_servidor.sh --etapas ajuste biblioteca
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. ambiente
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r scripts/requirements.txt
fi

# 2. extrai as tomografias (só na primeira vez); os .tar.gz vêm de srtuttugart/
mkdir -p 00_bruto/F001
for t in srtuttugart/reconstructed_*.tar.gz; do
  [ -e "$t" ] || continue
  n=$(basename "$t" .tar.gz)
  if ! find 00_bruto/F001 -path "*$n*" -name 'slice_*.tif' -print -quit | grep -q .; then
    echo "extraindo $t ..."; tar -xzf "$t" -C 00_bruto/F001
  fi
done

# 3. pipeline em segundo plano (sobrevive ao logout do ssh)
mkdir -p 03_modelo/logs
LOG=03_modelo/logs/pipeline_$(date +%Y%m%d_%H%M%S).log
nohup .venv/bin/python -u scripts/pipeline.py "$@" > "$LOG" 2>&1 &
echo "rodando (PID $!). Acompanhe com:  tail -f $LOG"
