# Provas do núcleo C (mdsim)

Para mudanças de velocidade (categoria I): o resultado tem de ser byte a byte igual ao da base.

1. Compilar base e nova em `$CREF` (padrão `~/workspace/s2_bin`): `gcc -O3 -march=native -ffp-contract=off -fopenmp -o $CREF/mdsim_base native/mdsim.c -lm` (a base a partir do commit anterior). Repetir com `-march=x86-64-v2` (flag do pacote). O `-ffp-contract=off` é obrigatório: sem ele o `-march=native` funde `a*b+c` (FMA) e a saída deixa de ser igual à do pacote. As referências em `$CREF/ref` gravadas antes de 2026-11-10 são do binário com FMA: regravar.
2. Gravar entradas (uma vez por caso): `CASO=m1200 MDBIN=mdsim_base MD_NATIVE=stress/cref/capture.sh node stress/bench_native.mjs 4 '<spec>'`. Já gravados no vid1: `m250l m250t w250 g1000 m1200` (e `g4700`, giratório Ø150).
3. Referência e comparação: `bash stress/cref/cmp.sh mdsim_base 4 m250l` (vira referência), depois `bash stress/cref/cmp.sh mdsim_nova 4 m250l w250` e com 1 e 16 threads.
4. Tempo: rodar base e nova ao mesmo tempo (o vid1 é compartilhado; rodadas soltas oscilam ±10 %).

Perfil sem `perf` (bloqueado no vid1): `gcc -O2 -shared -fPIC -o sampler.so stress/cref/sampler.c -ldl`, compilar o mdsim com `-g`, rodar com `SAMPLE_OUT=s.txt LD_PRELOAD=./sampler.so` e 1 thread, e somar as linhas com `addr2line -e <bin> -f`.
