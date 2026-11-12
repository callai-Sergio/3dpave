# Marshall Digital (3dpave)

Simulador DEM de compactação de CPs asfálticos ([W], Marshall, giratório). App em `src/` → `node build.mjs` → `marshall_digital_app.html`; núcleo em C em `native/mdsim.c`; harness em `stress/`; pacote Windows em `pacote/` (gerado no PC do usuário, não no vid1).

## Onde está o estado
- `docs/README.md`: índice da documentação (specs, plans, historic).
- `melhorias/BACKLOG.md`: status de cada item (IDs A*, F*, S*) e medições. Ler só a linha ou seção do item em questão (`grep -n`), não o arquivo todo.
- `melhorias/PLANO_DESEMPENHO.md`: plano de velocidade (Fases 1–3).
- `melhorias/HANDOFF.md`: trabalho em aberto da última sessão. Ler primeiro.

## Máquina (vid1)
- Node 24.11.1: `export PATH=/data/callai/workspace/3dpave_stress/.node/bin:$PATH` (o golden exige essa versão).
- Núcleo C: `gcc -O3 -march=native -ffp-contract=off -fopenmp -o <bin> native/mdsim.c -lm`; o pacote usa `-march=x86-64-v2`. Nunca tirar o `-ffp-contract=off`: sem ele o nativo usa FMA e calcula diferente do pacote.
- Servidor compartilhado (~55 de 96 núcleos ocupados): tempos oscilam ±10 %; comparar base e nova rodando juntas.
- Provas do núcleo C (entradas gravadas, comparação byte a byte, amostrador sem `perf`): `stress/cref/README.md`.

## Economia de tokens
- Rodadas longas (benchmarks, golden, grades): em segundo plano, saída num arquivo, e mostrar só as linhas de resultado (`grep "^threads\|dem=\|IGUAL\|DIFERENTE"`). Nunca colar logs de progresso.
- Uma espera por rodada (comando em segundo plano que termina sozinho); não usar `tail -F` sem filtro.
- Ler arquivos grandes (`mdsim.c`, `BACKLOG.md`, HTML do app) só por trecho (`grep -n` + `sed -n a,bp`).
- Ao fechar um bloco de trabalho, atualizar `melhorias/HANDOFF.md` em poucas linhas, para a próxima sessão começar dali.

## Regras
- Mudança só de velocidade no C: saída igual byte a byte (5 casos × 1/4/16 threads × as duas flags). Mudança de física ou protocolo: calibração reduzida (`stress/grids/calib_red_pb*.json`).
- Golden: `node stress/golden.mjs --determinism` depois de mexer no worker JS. Nunca afrouxar o golden para passar.
- Commit e push só com o OK do usuário. Mensagens em português, com o ID do item.
