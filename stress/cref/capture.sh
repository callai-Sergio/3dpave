#!/usr/bin/env bash
# Grava a entrada do mdsim e roda o binário real. Uso pelo harness:
#   CASO=nome MD_NATIVE=stress/cref/capture.sh node stress/bench_native.mjs 4 '<spec>'
# A entrada fica em $CREF/casos/$CASO.bin (padrão CREF=~/workspace/s2_bin); o binário é $CREF/${MDBIN:-mdsim}.
CREF=${CREF:-$HOME/workspace/s2_bin}; mkdir -p "$CREF/casos"
cp "$1" "$CREF/casos/${CASO}.bin"
exec "$CREF/${MDBIN:-mdsim}" "$@"
