# Briefing: Marshall Digital, app unificado de compactação (2026-10-29)

Cole este arquivo no início do novo chat. Pasta: `H:\data\callai\workspace\3dpave`.

## 1. O que é o projeto
Simulador DEM de corpo de prova asfáltico em um app HTML único (`marshall_digital_app.html`). Tem três protocolos:
- **[W]**: pistões, sem gravidade;
- **Marshall**: 75 golpes por face;
- **Giratório**: molde inclinado em precessão.

Cada um roda em dois modos de AVC: **travado** (mede o esforço de ajuste) e **livre** (a altura final define o AVC). A física também roda num **núcleo em C com OpenMP** (`native/mdsim.c`) no servidor, com o mesmo resultado em JS e em C.

## 2. Decisões já tomadas pelo usuário (não rediscutir)
- Os dois modos de AVC, travado e livre.
- Temperatura de compactação como entrada, com a tabela EN 12697-35 (35/50: 165 °C … 160/220: 135 °C).
- Giratório com as duas opções de molde.
- Dados de validação do LTPP.
- Tudo num app só, com o giratório incluído.
- **Marshall só em tamanho real** (1200 g, Ø101,6 mm); o molde pequeno Ø65 sai. Giratório com padrão de 4700 g em Ø150.
- Física rodando em C no servidor.
- Formas reais de agregado (biblioteca de `Aggregate types/03_modelo`) integradas como opção.
- **Prensa de duplo êmbolo (Albayati): só no backlog, não implementar.**

## 3. Regras de trabalho
- Antes de mudança grande: apresentar o plano e esperar o OK.
- Confirmar antes de qualquer ação irreversível.
- **Servidor compartilhado** (`ssh vid1` = `sergio@137.226.169.235:/data/callai/workspace/3dpave`, com ~30 usuários e carga 60–130):
  - usar no máximo ~32 núcleos;
  - não instalar nada lá sem perguntar.
- Responder em português.

## 4. Mapa do código
| Onde | O quê |
|---|---|
| `src/` + `build.mjs` | Fonte modular. `node build.mjs` gera o app. **Rodar o build antes do harness.** Ver `src/README.md`. |
| `src/worker/20_dem.js` | DEM em JS: contato casca convexa × pontos de prova, película de mastique (mola, lubrificação, coesão, piso `gapMin`). |
| `src/worker/25_protocolos.js` | `protoW`, `protoMarshall`, `protoGiratorio`, `compactar()` (com o gancho `PROBE` para o C). |
| `src/worker/12_formas_reais.js` | Gerado por `tools/gen_formas_reais.mjs` (RS = diabásio SMA F001; RT = F001 + STL F004). |
| `src/ui/*` | Interface: campos `f-proto`, `f-avcmode`, `f-temp`, `f-grade`, `f-lam`, `f-escE`, `f-escP`, `f-lib`…; `SIZES`; animação. |
| `native/mdsim.c` | Porta em C. Uso: `mdsim in.bin out.bin [núcleos]`. Local: `native/mdsim.exe` (gcc do WinLibs). |
| `stress/engine.mjs`, `native.mjs` | Harness. `MD_NATIVE=<mdsim> MD_THREADS=4` troca a física pela do C. |
| `stress/kpi.mjs`, `golden.mjs`, `validacao.mjs` | KPIs (K1–K33), golden do [W] e validação V1 contra o Albayati. |
| `stress/run.mjs` + `stress/grids/*.json` | Grades de casos (`--jobs 8 --timeout 10800 --mem 8192`). |
| `stress/server/deploy_native.sh` | Envia para o vid1 e compila lá (usa as chaves ssh do Windows). |
| `plano_app_unificado_compactacao.md` | Plano mestre: §6 fases F0–F7; §8 avaliação dos KPIs; **§9 desatualizada**. |
| `plano_melhorias_marshall_digital.md` | Plano de KPIs do usuário (P1–P7, K1–K32). |
| `legacy_2026-10-28/` | Versão anterior à unificação. |

Rodar no servidor:
```
cd /data/callai/workspace/3dpave && MD_NATIVE=$PWD/native/mdsim MD_THREADS=4 nohup node stress/run.mjs stress/grids/<grade>.json --jobs 8 --timeout 10800 --mem 8192 > stress/logs/<nome>.log 2>&1 &
```

## 5. Estado atual
- **Interpenetração (item 1 do usuário):** resolvida. A sobreposição no golden caiu de 0,61 para 0,006 cm³ e o K33 ficou em 0.
- **Compactação progressiva (item 2):** queda, golpes e giros incrementais, com curva de AVC × golpe ou giro e animação.
- **C × JS:** o golden bate (Vagg 52,30 × 52,32). Com 1 núcleo o C é 1,55× mais rápido; com 8 núcleos, 3×; com 24, 5× (as partes seriais limitam a escala).
- **Calibração do Marshall no tamanho real** (Albayati 60/70, 140 °C, formas RT, semente única, 24 rodadas; arquivo `stress/results/calib_albayati_m.jsonl` no vid1):

  | λ | escE | AVC (Pb 4 / 4,5 / 5 / 5,5) | Erro médio |
  |---|---|---|---|
  | lab | | 6,1 / 4,8 / 3,3 / 2,7 | |
  | 0,3 | 0,005 | 0,9 / 0,2 / 0,8 / 0,1 | 3,7 pp |
  | **0,5** | **0,002** | **8,2 / 4,1 / 4,0 / 2,7** | **0,9 pp** |
  | 0,5 | 0,005 | 6,2 / 2,6 / 2,9 / 1,7 | 0,9 pp |

  O melhor candidato é λ 0,5 com escE 0,002. Os padrões atuais do app são λ 0,3 e escE 0,005. Ressalvas:
  - com uma semente só, o ruído é de ~±1 pp;
  - **o K33 (penetração entre pedras) chega a 6–8% com λ 0,5, acima do limite de 2%.**
- O K1 quebra em todas as rodadas do modo livre (esperado, porque o AVC alvo é só referência). O K19 (bolha encostando em agregado) quebra em todos os casos.

## 6. Próximos passos (em ordem)
1. **Grade de refinamento:** λ 0,45 / 0,5 / 0,55 / 0,6 × escE 0,002 / 0,003 × sementes 2024–2026 × Pb 4–5,5. São 96 rodadas, ~5–6 h no vid1. Criar `stress/grids/calib_albayati_m2.json` a partir de `calib_albayati_m.json`. **Ainda não aprovada; perguntar antes de rodar.**
2. **Investigar o K33 alto com λ 0,5** (golpe afundando pedras através da película).
3. **Interface só em tamanho real:** tirar o 250 g/Ø65 do Marshall e usar 4700 g/Ø150 como padrão do giratório. Já pedido, ainda não feito.
4. Aplicar no app os λ e escE calibrados, depois de confirmados.
5. Calibrar o giratório no tamanho real.
6. Desempenho do C (S2): tornar paralelos ou reduzir `buildPairs`, o CSR e as cópias da varredura.
7. S5: WebAssembly no navegador e "Abrir resultado do servidor".
8. S6: escala de massa e fim do golpe pelo repouso.
9. Pintura do mastique: P2 (excesso em misturas graúdas) e P3 (bolhas que não cabem; K19).
10. Atualizar a §9 de `plano_app_unificado_compactacao.md` com a arquitetura em C, o benchmark e a calibração.
11. Backlog: duplo êmbolo (V2); granulometria do LTPP (falta); paper Zhu 2022 (falta).

## 7. Armadilhas conhecidas
- Arquivos com CRLF: normalizar antes de procurar marcadores (`replace(/\r\n/g,'\n')`).
- O ssh do Git Bash usa outro HOME: passar `-F /c/Users/$USERNAME/.ssh/config`. No PowerShell, `ssh vid1` funciona direto.
- Nunca usar `cat` sem heredoc no Bash: o comando fica preso.
- Porta da prévia local: 8767 (`marshall-static-2` em `.claude/launch.json`), porque a 8765 é de outra sessão.
- gcc local: acrescentar ao PATH `...\WinGet\Packages\BrechtSanders.WinLibs*\mingw64\bin`.
