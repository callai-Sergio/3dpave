# Plano de implementação: exemplos prontos (O2) sobre salvar/abrir resultado (O3)

Status: **implementado em 2026-11-02** (ver HANDOFF.md, itens 6 e 7). O desenho final trocou o `res` completo por "saída do mdsim + replay": o arquivo guarda a compactação e o app refaz só voxels, mastique e bolhas. A saída do mdsim do giratório tem 40 MB (128 quadros), não 254 KB; o arquivo salvo tem metade dos quadros e fica em 10–19 MB. Decisões marcadas **[DECIDIR]** vão para conversa com o usuário.

## O que o código mostra hoje
- O resultado que a tela usa é o `res` da mensagem `done` do worker (`src/worker/40_pipeline.js`, fim de `runAll`): `lab` (Int32 por voxel), `phase` (Uint8 por voxel), `pos`/`q`/`tpl`/`sc`/`fr` (partículas), `meshE`, `bubbles`, `st` (estatísticas), `mar.anim` (quadros da animação), mais `tTotal`.
- A tela recebe isso em `generate()` (`src/ui/10_painel.js`, `worker.onmessage`, ramo `done`): `result=...`, `buildScene(result)`, `renderPanel()`, `setExport(true)`, `initSection()`.
- Voxel do giratório Ø150: 0,6 mm, cerca de 250 × 250 × 190 = 12 M voxels, então `lab` sozinho tem ~48 MB e `phase` ~12 MB, sem compressão. A saída do núcleo C (`mdsim`, 254 KB) é só a parte DEM (posições e quaternions); voxels, mastique e bolhas são refeitos depois (pós-DEM, 38 s no vid1).
- O servidor local do pacote (`pacote/src/marshall_simulator/app.py`) já tem `save_file` (diálogo de salvar) e serve os arquivos estáticos; não tem rota para abrir arquivo nem pasta de exemplos.

## Passos
1. **Medir o tamanho real do resultado** (spike, sem mudar o app). Rodar o `runAll` no harness (`stress/engine.mjs`) com Marshall 1200 g e com o giratório, serializar `res` e medir bruto e gzip, separando `lab`, `phase`, `anim`, malha. Pronto quando houver uma tabela de bytes por campo. Decide o passo 2.
2. **[DECIDIR] Formato do `.mdres`.**
   - A (completo): grava `res` inteiro comprimido; abre na hora; arquivo grande (dezenas de MB por giratório, a medir).
   - B (compacto): grava a entrada (`cfg`+`comp`) e a saída DEM (`pos`, `q`, `tpl`, `sc`, `fr`, `anim`); ao abrir, refaz só o pós-DEM (voxels, mastique, bolhas, malha). Arquivo pequeno; abrir leva o tempo do pós-DEM no PC do usuário (a medir).
   - C: híbrido, gravando também `phase` comprimido e refazendo só a malha e o `lab`.
3. **Salvar resultado** (O3, escrita). Botão "Salvar resultado" ao lado de "Exportar". No pacote usa o `save_file` existente; no navegador, download. Cabeçalho do arquivo: versão do formato, versão do app, `cfg`, hash da entrada (reaproveitado por O1).
4. **Abrir resultado** (O3, leitura). Função `loadResult(res, cfg)` extraída do ramo `done` de `generate()`, para a rodada normal e o arquivo usarem o mesmo caminho; preenche o formulário com o `cfg` gravado. Recusa arquivo de versão de formato desconhecida, com mensagem clara.
5. **Menu "Exemplos"** (O2). Lista com nome, tipo (Marshall, giratório), AVC, N de partículas e tempo de cálculo original; "Abrir" usa o passo 4; "Recalcular" volta ao formulário com a mesma entrada.
6. **Lote de exemplos no vid1.** Script que roda a lista curada com 16 threads, salva cada `.mdres` e um `exemplos.json` (índice). Roda em segundo plano, uma rodada por vez. Pronto quando todos os arquivos abrirem no app e o `st.AVC` do arquivo bater com o da rodada.
7. **Entrega no pacote.** Pasta `exemplos/` dentro do pacote (`build_pacote.py`) e rota no servidor local para listar e servir; no HTML único (artefato), o menu fica oculto. **[DECIDIR]** exemplos dentro do pacote ou baixados sob demanda, conforme o tamanho do passo 1.
8. **Provas.** `node stress/golden.mjs --determinism` (o worker muda no passo 4); abrir cada exemplo e comparar `st` com o gravado; abrir um arquivo corrompido e um de versão futura.

## Ordem e dependências
1 → 2 → (3, 4 em sequência) → 5; o passo 6 só começa depois do 2, e pode rodar em paralelo a 3–5 (usa o vid1, não mexe nos arquivos). 7 e 8 por último.

## Decisões do usuário (2026-11-02)
- Formato (passo 2): **medir antes** (passo 1), depois escolher A, B ou C. Depois da explicação, o usuário respondeu "c": inclinação pelo **híbrido (C)**, a confirmar com a medida. O usuário pediu para não rodar nada por enquanto.
- Lista (passo 6): **Marshall 1200 g, giratório Ø150 e variações de curva** (2 a 3 curvas, por exemplo AC, PA e SMA, mesma compactação). CP rápido de 250 g ficou fora.

## Ainda em aberto
- Exemplos no pacote ou sob demanda (passo 7), depende do passo 1.
- Quais curvas exatas e a semente de cada exemplo (passo 6).
