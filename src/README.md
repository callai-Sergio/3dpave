# Fontes do app unificado (Marshall Simulator)

O app continua sendo **um único HTML** (`marshall_digital_app.html`), porque o artefato exige um arquivo só, com o worker num `<script type="text/x-worker">`. As fontes ficam aqui, separadas, e o `build.mjs` junta tudo:

```bash
node build.mjs
```

Edite só os arquivos de `src/` e rode o build. Não edite o HTML gerado.

| Pasta | Conteúdo | Ordem no HTML |
|---|---|---|
| `app/head.html` | `<head>`, CSS e o HTML da página até a abertura do worker | 1 |
| `worker/00_util.js` | RNG, Tabela 2 de [W], Eqs. 3–5, `progress`, ganchos do harness (`PROBE`) | 2 |
| `worker/10_formas.js` | casca convexa, forma de agregado, pontos de prova do contato, sorteio das partículas | 3 |
| `worker/20_dem.js` | DEM de corpos rígidos convexos com película de mastique; placas, soquete, servo de força, molde inclinado | 4 |
| `worker/25_protocolos.js` | protocolos [W] pistões, Marshall e giratório; modos de AVC travado/livre; gravação da animação | 5 |
| `worker/30_voxel.js` | chamfer, surface nets, ruído | 6 |
| `worker/40_pipeline.js` | `runAll`: formas → compactação → voxels → mastique → bolhas → estatísticas | 7 |
| `app/mid.html` | fecha o worker e abre o script da página | 8 |
| `ui/*.js` | formulário, composição, viscosidade, painel, cena 3D e animação, exportação | 9 |
| `app/foot.html` | fecha a página | 10 |

O harness de estresse (`stress/engine.mjs`) carrega o worker direto de `src/worker` (`workerSource()` do `build.mjs`). As funções da página que ele usa (`composicao`, `viscMastic`, a biblioteca de curvas…) ele lê do HTML gerado, então **rode o build antes do harness**.

## Modelo de contato (worker/20_dem.js)

- **Mola de pedra por tamanho (A4).** kn × max(1, sa·sb/(sa+sb)) e trava em 0,125 × Min Feret da menor pedra, igual em `native/mdsim.c`.
- **Forma de colisão = forma desenhada.** Os pontos de prova de uma partícula (vértices da casca e meios das arestas > 0,6 do Min Feret) são testados contra os semiplanos da casca da outra, nos dois sentidos. As esferas de [W] ficaram só para o raio envolvente.
- **Lista de candidatos.** A varredura completa só roda quando algum ponto de prova andou mais que metade da margem (0,15 mm). Nos outros passos, só os candidatos próximos são avaliados.
- **Película de mastique.** A espessura é 2·λ·M / área da casca de todos os agregados (λ = 0,6, como em Komaragiri et al. 2021). Dentro dela atuam:
  - uma mola mole kf = 0,05·kn;
  - a lubrificação viscosa F = η·A·v / h, com η do betume na temperatura (A-VTS) corrigida pelo fíler e pelos finos (Krieger–Dougherty);
  - a coesão contra a separação.
- **Escala de carga.** As pedras do DEM são cerca de 1000 vezes mais moles que as reais, então a energia do soquete e a pressão do giratório entram multiplicadas por uma escala (Avançado). Essa escala é o parâmetro calibrado contra o laboratório (`stress/validacao.mjs`).
