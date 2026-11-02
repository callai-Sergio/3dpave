#!/usr/bin/env bash
# Roda um binário do mdsim direto sobre entradas gravadas e compara a saída com a referência, byte a byte (sem tDem/threads).
#   bash stress/cref/cmp.sh <binário em $CREF> <threads> <caso...>
# A primeira rodada de um caso vira a referência ($CREF/ref/<caso>.out). Imprime uma linha por caso: tempos (MD_PROF) e IGUAL/DIFERENTE.
CREF=${CREF:-$HOME/workspace/s2_bin}; H=$(cd "$(dirname "$0")" && pwd); B=$1; T=$2; shift 2; mkdir -p "$CREF/out" "$CREF/ref"
for c in "$@"; do
  o=$CREF/out/${B}_${c}_t$T.out
  MD_PROF=1 "$CREF/$B" "$CREF/casos/$c.bin" "$o" "$T" 2> "$o.err" >/dev/null
  t=$(grep "^PROF t" "$o.err" | grep -o "dem=[0-9.]*\|fPar=[0-9.]*\|fPart=[0-9.]*\|varrCompleta=[0-9.]*\|varrParcial=[0-9.]*\|rot=[0-9.]*" | tr '\n' ' ')
  if [ ! -f "$CREF/ref/$c.out" ]; then cp "$o" "$CREF/ref/$c.out"; v=REF
  elif python3 -I "$H/outeq.py" "$o" "$CREF/ref/$c.out"; then v=IGUAL; else v=DIFERENTE; fi
  echo "$B $c t$T $t$v"
done
