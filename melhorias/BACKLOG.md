# Backlog consolidado: Marshall Digital (2026-10-29)

Junta, sem duplicatas, as melhorias propostas em todos os chats do projeto. A pasta `melhorias/` estava vazia, então as fontes foram os documentos da raiz e as transcrições dos 6 chats anteriores.

## Fontes

| Código | Fonte |
|---|---|
| PM | `plano_melhorias_marshall_digital.md` (P1–P7, M1–M10, metas K, melhorias 1–13) |
| PU | `plano_app_unificado_compactacao.md` (fases F0–F7, §8 KPIs V1–V7, §9 estado) |
| BR | `BRIEFING_chat_unificado.md` (chat "Melhorias no código de simulação": unificação, núcleo C, calibração) |
| PP | `PROXIMOS_PASSOS.md` (chat "Arquivos na pasta": artefato, pacote, curvas DE, PT/EN) |
| AG | chat "Pipeline de agregados" (modelo de forma v2, `biblioteca_formas_reais.json`) |
| ST | chat "Stress test" + `stress/results/screening_findings.md` (triagem de 99 casos) |
| IN | `INSTRUCOES_MELHORIAS.md` |

Status: **feito** · **parcial** · **falta** · **bloqueado** (falta dado ou OK do usuário) · **backlog** (não implementar agora).

## Bloco 0: infraestrutura e reprodutibilidade

| ID | Origem | Problema | Mudança | Arquivo | KPI / prova | Meta | Prio | Status |
|---|---|---|---|---|---|---|---|---|
| I1 | IN §6, PM 11 | O `server_run.sh` do PC aceita Node ≥ 20 e baixa v22.11.0; o `deploy.sh` sobrescreve a correção feita à mão no vid1 | Preferir `.node/bin/node`; baixar v24.11.1; exigir 24.11.1 | `stress/server/server_run.sh` | golden passa no vid1 depois do deploy | Node 24.11.1 | alta | falta |
| I2 | PM 11, P7 | O jsonl não diz em que plataforma rodou | Gravar versão do Node, SO e hash do app em cada linha | `stress/run.mjs` | campo presente | — | alta | falta |
| I3 | IN §4.2 | Pasta sem git | `git init`, commit base e repositório privado no GitHub | raiz | — | — | alta | **feito** (este chat) |
| I4 | BR §6.10 | §9 do plano unificado desatualizada (não fala do C nem da calibração Ø101,6) | Atualizar §9 | `plano_app_unificado_compactacao.md` | — | — | baixa | falta |

## Bloco 1: medição (harness `stress/kpi.mjs`), antes de mexer no simulador

| ID | Origem | Problema | Mudança | Arquivo | KPI / prova | Meta | Prio | Status |
|---|---|---|---|---|---|---|---|---|
| M1 | PM M1, ST | K16 = razão máx/mín explode quando um terço tem ~0 vazios (3105) | K16 rebaixado a informativo; usar K16b | `kpi.mjs` | K16b | ver conflito C1 | alta | **feito** (K16b existe; limites em conflito) |
| M2 | PM M2 | Terços diluem a camada da face | K27 (vazios na face) | `kpi.mjs:154` | K27 | ≥ 1,0 / ≥ 0,7 | alta | **feito** |
| M2b | PM K28 | Falta medir a espessura da camada sem vazio | K28: espessura junto à face com AVC < 0,25 × alvo | `kpi.mjs` (usa `st.vprofile`) | K28 | ≤ 0,5 mm / ≤ 1 mm | alta | falta |
| M2c | PM K29 | Esqueleto frouxo no miolo | K29 | `kpi.mjs:155` | K29 | ≥ 0,85 / ≥ 0,70 | alta | **feito** (faixa 2ª–4ª fatia; plano pedia 2–8 mm) |
| M2d | PM K30 | Assimetria topo/base | K30: \|AVC 0–4 mm topo − base\| / alvo | `kpi.mjs` | K30 | ≤ 0,15 / ≤ 0,30 | média | falta |
| M3 | PM M3 | K9 com pass 1e-9 inatingível | pass 1e-3 | `kpi.mjs:166` | K9 | ≤ 1e-3 / ≤ 5e-3 | — | **feito** (o `THRESH` ainda diz 1e-9; limpar) |
| M4 | PM M4 | K15 é ruído com poucos voxels de vazio por quadrante | Só avaliar com N mínimo de voxels; senão `na` | `kpi.mjs` | K15, CV entre 5 sementes ≤ 0,3 | ≤ 0,25 / ≤ 0,50 | alta | falta |
| M5 | PM M5 | K23 conta só a malha de vazios; com B = 100 % dá 0 | Contar vazios + bolhas | `kpi.mjs:151` | K23 | ≤ 250 mil | média | falta |
| M6 | PM M6 | K13 com limite 10 nunca dispara (máx 0,95) | Limite 2 / 5 | `kpi.mjs:17` | K13 | ≤ 2 / ≤ 5 | baixa | falta |
| M7 | PM M7, M8 | K11b, K1, K2, K4, K10–K12 não discriminam | Marcar como "guarda de regressão" no relatório | `report.mjs` | — | — | baixa | falta |
| M8 | PM 3.1 | K14 só tem piso; com k = 1 chega a 26 | Teto: pass 1,3–4, warn 1,0–6 | `kpi.mjs:18` | K14 | 1,3–4 | média | falta |
| M9 | PM P4 | `placeFail` não diz a fração | Registrar fração, tamanho e tentativas | app + `kpi.mjs` | placeFail por fração | 0 | média | falta |
| M10 | PM M10, P7 | Golden: parede radial ± 2 pp apertada; varia por semente e plataforma | Referência por plataforma **ou** ± 6 pp, mantendo K26 como guarda | `golden.mjs` | golden | — | média | falta (decidir: ver C5) |
| M11 | PM K32 | Sem KPI de reprodutibilidade entre plataformas | K32: diferença de Vagg PC × vid1 | `golden.mjs` | K32 | ≤ 0,05 % / ≤ 0,5 % | baixa | falta (depende de I2) |
| M12 | PU §8.3 | KPIs novos sem teste de mutação | Mutação: faces como agregado → K27/K28 quebram; colisão por esferas → K33 quebra | `stress/` | — | quebram com o defeito | média | falta |
| M13 | PM 10, IN §4.6 | Limites ainda são os iniciais | Recalibrar depois da Fase 2 e analisar pelos KPIs contínuos | `kpi.mjs`, `effects.mjs` | — | — | média | falta (depois do bloco 2) |

## Bloco 2: simulador (app `src/` → `marshall_digital_app.html`)

| ID | Origem | Problema | Mudança | Arquivo | KPI / prova | Meta | Prio | Status |
|---|---|---|---|---|---|---|---|---|
| A1 | PM P1a, PU F4 | Camada junto à face sem vazios (pintura trata pistões como agregado) | Peso das faces `faceW` na distância | `src/worker/40_pipeline.js:61` | K27, K28 | K27 ≥ 1; K28 ≤ 0,5 mm | alta | **parcial**: feito (golden K27 = 2,6); falta medir K28 e a triagem; se afasta de [W] §3.6 → conferir o texto "Sobre o método" e o I18N_EN |
| A2 | PM P1b, ST 1 | Esqueleto denso nas pontas e frouxo no meio (AVC alto, sem força radial) | No Marshall/giratório, a gravidade e os golpes por face já existem; no [W], testar avisar quando k = 0 ou alternar o pistão | `25_protocolos.js` | K29, K16b | K29 ≥ 0,85 | alta | parcial (Marshall/giratório: medir; [W]: falta) |
| A3 | BR §6.3, decisão | Marshall só em tamanho real | Tirar 250 g/Ø65 do Marshall; giratório padrão 4700 g/Ø150 | `src/ui/*` (`SIZES`) | smoke | — | alta | falta (já pedido) |
| A4 | BR §6.2, §5 | K33 = 6–8 % com λ 0,5 (o golpe afunda pedras pela película) | Investigar: passo de tempo, rigidez da película, piso `gapMin` | `20_dem.js`, `mdsim.c` | K33, K8 | K33 ≤ 2 %; K8 ≤ 0,10 | alta | falta |
| A5 | BR §6.1 | Calibração com 1 semente | Grade `calib_albayati_m2.json`: λ 0,45–0,6 × escE 0,002/0,003 × 3 sementes × 4 Pb (96 rodadas, ~5–6 h, ≤ 32 núcleos) | `stress/grids/` | V1 | MAE ≤ 0,5 pp, inclinação ±30 % | alta | **bloqueado**: precisa do seu OK |
| A6 | BR §6.4 | Padrões do app (λ 0,3, escE 0,005) erram 3,7 pp | Aplicar λ/escE calibrados | `src/ui` | V1, golden | MAE ≤ 0,5 pp | alta | falta (depois de A4 e A5) |
| A7 | PM P2, ST 2 | Mastique +5–11 % com p2 = 20 (sobreposição vira mastique) | Revisar o fechamento em `convert()` com esqueleto aberto | `40_pipeline.js` | K3 | \|K3\| ≤ 3 % em todas as células | alta | falta |
| A8 | PM P3, ST 3 | Bolhas não cabem com AVC 12 % e B = 100 %; bolhas tocam agregado | Estimar antes, limitar B e avisar (PT/EN); proibir semeadura encostada | pipeline + UI | K5, K6, K19 | K19 = 0; \|K5\| ≤ 5 % | média | falta |
| A9 | PM P4, ST 5 | `placeFail` > 0 em 41 % dos casos | Mais tentativas ou relaxar antes de desistir (PU F1 diz "sem desistência": medir) | `10_*`/colocação | placeFail | 0 | média | a medir |
| A10 | PM P5 | K8 = 0,61 isolado | Passo de tempo pelo menor tamanho (pode já estar resolvido com F1) | `20_dem.js` | K8 | ≤ 0,10 | média | a medir |
| A11 | PM P6 | K14 instável com k = 1 | Investigar k = 1 × k = 2; aviso de calibração de [W] junto do campo (PT/EN) | UI | K14 | 1,3–4 | média | falta |
| A12 | ST 4 | Pedras grandes no molde pequeno: quadrantes desiguais | Resolve-se em parte com A3 (tamanho real) | — | K15 | ≤ 0,25 | baixa | depende de A3 |
| A13 | BR §6.5 | Giratório sem calibração no tamanho real | Calibrar em Ø150, 4700 g | grade nova | V4, V5 | V4 RMSE ≤ 10 % | média | falta (precisa de curva h × giro do lab) |

## Bloco 3: formas, curvas, pacote e interface

| ID | Origem | Problema | Mudança | Arquivo | Prova | Prio | Status |
|---|---|---|---|---|---|---|---|
| F1 | PP 1, AG | Gerador convexo (convexidade ~0,99; real 0,66–0,81) | Sortear de `biblioteca_formas_reais.json` | `src/worker/12_formas_reais.js`, `md_core` | volume fecha; golden [W] idêntico | alta | **parcial**: no app já existem RS (F001) e RT (F001+F004) (ver C2); falta `md_core` (Python) e, se quiser, `f004_A` sozinho |
| F2 | PP 2 | Peneiras intermediárias DE AC/PA aproximadas (status 'R') | Conferir com TL Asphalt-StB 07/13; atualizar `gradation_points.csv` | curvas | — | média | **bloqueado**: preciso das tabelas da norma |
| F3 | PP 3 | Artefato e pacote com HTML antigo | Republicar o artefato e refazer wheel + zip com o app unificado | `pacote/` | instala e abre | média | falta (ver C4) |
| F4 | PP 4 | EN usa vírgula decimal | Ponto decimal na versão EN | `src/ui` | — | baixa | falta |
| F5 | PP 4 | Eq. 3 de [W] não serve para PA (cai em 48 %) | Sugestão de B por tipo de curva | `src/ui` | — | baixa | falta |
| F6 | PP 4 | Testes faltando | 1000 g, preset [W] completo, download do zip, pacote em macOS/Linux | — | — | baixa | falta |
| F7 | AG | Eq. 3 (Awuah) ignora a forma: propriedades idênticas | Modelo de previsão que use força de compactação ou contatos do DEM | — | — | baixa | backlog |

## Bloco 4: desempenho

| ID | Origem | Mudança | Prova | Prio | Status |
|---|---|---|---|---|---|
| S2 | BR §6.6 | Paralelizar ou reduzir `buildPairs`, CSR e cópias da varredura em `mdsim.c` | C × JS bate; escala > 5× com 24 núcleos | média | falta |
| S5 | BR §6.7 | WebAssembly no navegador; botão "Abrir resultado do servidor" | Ø150 em tempo aceitável; K32 | baixa | falta |
| S6 | BR §6.8 | Escala de massa; fim do golpe pelo repouso | K12, tempo | baixa | falta |

## Backlog (não implementar agora)

| ID | Origem | Item |
|---|---|---|
| B1 | BR decisão | Prensa de duplo êmbolo (Albayati), KPI V2 |
| B2 | PU §5, §7 | Granulometria do LTPP (falta o dado) → V3 |
| B3 | PU §7 | Paper Zhu et al. 2022 (falta) |
| B4 | PM 13 | Tomografia de CPs Marshall do laboratório (referência para K27–K30) |
| B5 | IN §4.6, PM 12 | Fase 2 focada (p2 × AVC × bolhas, 5 sementes) para medir o bloco 2 antes/depois |
| B6 | AG | Segmentação: ~5 % dos agregados claros texturizados ficam de fora; ~20 GB brutos no vid1 para limpar |

## Conflitos entre chats

| # | Conflito | Proposta |
|---|---|---|
| C1 | K16b: PM pede 0,30 / 0,60; o chat unificado alargou para 0,75 / 1,0 porque, com mais vazios nas faces (K27 > 1, como no CP real), os terços diferem por desenho | Manter 0,75 / 1,0 como "a calibrar" até haver CT (B4); o K16b não reprova fase |
| C2 | Formas reais: PP fala em `sma_diabasio`, `f004_A`, `todos` (do modelo v2); o app tem RS (F001) e RT (F001 + F004), gerados por `tools/gen_formas_reais.mjs` | Conferir se RS = `sma_diabasio` e RT = `todos`; acrescentar `f004_A` só se você quiser |
| C3 | Tamanho: IN §4.6 e PM 12 pedem Fase 2 em 250 g; a decisão é Marshall só em tamanho real | Fase 2 do Marshall em 1200 g/Ø101,6; o 250 g fica só no protocolo [W] (golden do paper) |
| C4 | O artefato v5 (`NZdqVD7NCQUwAA3bTUsTNW`) e o pacote 1.0.0 levam o HTML anterior à unificação | Republicar com o app unificado só depois de A3 e A6, para os colegas receberem a versão calibrada |
| C5 | Golden da parede: PM sugere ± 6 pp **ou** referência por plataforma | Referência por plataforma (mantém o poder do teste); K26 como guarda |
| C6 | λ 0,5 é o melhor para o V1, mas quebra o K33 | Resolver A4 antes de A6; se não der, escolher o λ pelo melhor V1 com K33 ≤ 2 % |
| C7 | A1 se afasta de [W] §3.6 (as paredes contam como agregado) | Deixar explícito no "Sobre o método" (PT/EN) |

## Ordem proposta

1. I1, I2 (Node e plataforma no jsonl).
2. Bloco 1: M2b, M2d, M4, M5, M8, M9, M6, M3 (limpeza), M10/M11, M12. Depois, rodar a linha de base (golden, smoke e uma triagem no vid1).
3. Bloco 2: A3 → A4 → A5 (com seu OK) → A6 → A1 (medir) → A7 → A2 → A8 → A9/A10 → A11 → A13.
4. Bloco 3: F3 e C4 (pacote e artefato com a versão calibrada), F1 no `md_core`, F4, F5, F6; F2 quando houver as tabelas.
5. Bloco 4 e backlog.

Validação de cada mudança no app: `node build.mjs`, `node stress/golden.mjs --determinism` (`identical`), `node stress/run.mjs stress/grids/smoke.json --jobs 6` sem crash nem inválidos novos, e a meta do KPI no caso que motivou. Um commit por ID.
