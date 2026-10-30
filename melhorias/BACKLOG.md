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
| I1 | IN §6, PM 11 | O `server_run.sh` do PC aceita Node ≥ 20 e baixa v22.11.0; o `deploy.sh` sobrescreve a correção feita à mão no vid1 | Preferir `.node/bin/node`; baixar v24.11.1; exigir 24.11.1 | `stress/server/server_run.sh` | golden passa no vid1 depois do deploy | Node 24.11.1 | alta | **feito** (2026-10-29; ainda não testado no vid1) |
| I2 | PM 11, P7 | O jsonl não diz em que plataforma rodou | Gravar versão do Node, SO e hash do app em cada linha | `stress/run.mjs` | campo `env` presente | — | alta | **feito** (`env`: node, SO, host, hash do app, núcleo C) |
| I3 | IN §4.2 | Pasta sem git | `git init`, commit base e repositório privado no GitHub | raiz | — | — | alta | **feito** (este chat) |
| I5 | usuário | Documentar e versionar tudo | Commit + push a cada item; `WHITEPAPER.md` atualizado a cada mudança | raiz | — | — | alta | **regra permanente** |
| I4 | BR §6.10 | §9 do plano unificado desatualizada (não fala do C nem da calibração Ø101,6) | Atualizar §9 | `plano_app_unificado_compactacao.md` | — | — | baixa | falta |

## Bloco 1: medição (harness `stress/kpi.mjs`), antes de mexer no simulador

| ID | Origem | Problema | Mudança | Arquivo | KPI / prova | Meta | Prio | Status |
|---|---|---|---|---|---|---|---|---|
| M1 | PM M1, ST | K16 = razão máx/mín explode quando um terço tem ~0 vazios (3105) | K16 rebaixado a informativo; usar K16b | `kpi.mjs` | K16b | ver conflito C1 | alta | **feito** (K16b existe; limites em conflito) |
| M2 | PM M2 | Terços diluem a camada da face | K27 (vazios na face) | `kpi.mjs:154` | K27 | ≥ 1,0 / ≥ 0,7 | alta | **feito** |
| M2b | PM K28 | Falta medir a espessura da camada sem vazio | K28: espessura junto à face com AVC < 0,25 × alvo | `kpi.mjs` (usa `st.vprofile`) | K28 | ≤ 0,5 mm / ≤ 1 mm | alta | **feito**: novo perfil fino `st.vface` (camadas de voxel, 4 mm por face); smoke: K28 = 0 mm em 4 de 5 casos, 0,5 mm no outro → A1 confirmado |
| M2c | PM K29 | Esqueleto frouxo no miolo | K29 | `kpi.mjs:155` | K29 | ≥ 0,85 / ≥ 0,70 | alta | **feito** (faixa 2ª–4ª fatia; plano pedia 2–8 mm) |
| M2d | PM K30 | Assimetria topo/base | K30: \|AVC 0–4 mm topo − base\| / alvo | `kpi.mjs` | K30 | ≤ 0,15 / ≤ 0,30 | média | **feito**: golden 0,46 e semente 2 0,32 (topo com mais vazios) → item novo A14 |
| M3 | PM M3 | K9 com pass 1e-9 inatingível | pass 1e-3 | `kpi.mjs` | K9 | ≤ 1e-3 / ≤ 5e-3 | — | **feito** (limite movido para o `THRESH`) |
| M4 | PM M4 | K15 é ruído com poucos voxels de vazio por quadrante | Só avaliar com N mínimo de voxels; senão `na` | `kpi.mjs` | K15, CV entre 5 sementes ≤ 0,3 | ≤ 0,25 / ≤ 0,50 | alta | **feito**: `na` com < 1000 voxels de vazio por quadrante no terço central (N a calibrar com 5 sementes). O golden ainda dá 0,43 com 7700+ voxels: não é ruído, é o efeito de pedras grandes no molde pequeno (A12) |
| M5 | PM M5 | K23 conta só a malha de vazios; com B = 100 % dá 0 | Contar vazios + bolhas | `kpi.mjs` | K23 | ≤ 250 mil / ≤ 500 mil | média | **feito**: bolhas = 80 triângulos cada (icosaedro do export). O golden passa a ~290 mil → warn; ver item novo F8 |
| M6 | PM M6 | K13 com limite 10 nunca dispara (máx 0,95) | Limite 2 / 5 | `kpi.mjs` | K13 | ≤ 2 / ≤ 5 | baixa | **feito** (smoke: máx 1,93) |
| M7 | PM M7, M8 | K11b, K1, K2, K4, K10–K12 não discriminam | Marcar como "guarda de regressão" no relatório | `report.mjs` | — | — | baixa | falta |
| M8 | PM 3.1 | K14 só tem piso; com k = 1 chega a 26 | Teto: pass 1,3–4, warn 1,0–6 | `kpi.mjs` | K14 | 1,3–4 | média | **feito** (faixa `band`) |
| M9 | PM P4 | `placeFail` não diz a fração | Desde a unificação a colocação não desiste mais (sobe a coluna 0,5 mm a cada 20 tentativas), então `placeFail` = 0 sempre. Registrar quantas subidas houve | `kpi.mjs` | flag `raised` | — | média | **feito** (golden: 380 subidas) |
| M10 | PM M10, P7 | Golden: parede radial ± 2 pp apertada; varia por semente e plataforma | Referência exata por plataforma em `stress/golden_ref.json` (`--record`), mantendo as tolerâncias e o K26; a parede ± 2 pp **não** foi afrouxada | `golden.mjs` | golden | bit a bit na mesma plataforma | média | **feito** (referência do PC gravada; falta gravar a do vid1 no próximo deploy) |
| M11 | PM K32 | Sem KPI de reprodutibilidade entre plataformas | K32: diferença de Vagg PC × vid1 | `golden.mjs` | K32 | ≤ 0,05 % / ≤ 0,5 % | baixa | **feito** (aparece quando houver referência de outra plataforma) |
| M12 | PU §8.3 | KPIs novos sem teste de mutação | Mutação: faces como agregado → K27/K28 quebram; colisão por esferas → K33 quebra | `stress/` | — | quebram com o defeito | média | falta |
| M15 | novo (A7) | K2/K3/K7 escalavam pelo volume do CP de alvo (`comp.V`); no AVC livre a altura é a medida, e o K3 da calibração mostrava 4–6 % com o mastique real só 0,3–2,8 % acima | `scale = Vcil / (π R² H voxelizado)` | `kpi.mjs` | K3 | — | alta | **feito** (no modo travado não muda) |
| M14 | novo (A4) | Pelo núcleo C, o golden falha na parede radial (9,27 contra 6 ± 2 pp; JS dá 5,41) antes e depois da A4: volumes iguais, trajetória diferente | Investigar a divergência C × JS (ordem de soma no OpenMP, rotações) ou dar ao C a sua própria referência; não afrouxar a tolerância | `native/mdsim.c`, `golden.mjs` | golden via C | parede ± 2 pp | média | falta |
| M13 | PM 10, IN §4.6 | Limites ainda são os iniciais | Recalibrar depois da Fase 2 e analisar pelos KPIs contínuos | `kpi.mjs`, `effects.mjs` | — | — | média | falta (depois do bloco 2) |

## Bloco 2: simulador (app `src/` → `marshall_digital_app.html`)

| ID | Origem | Problema | Mudança | Arquivo | KPI / prova | Meta | Prio | Status |
|---|---|---|---|---|---|---|---|---|
| A1 | PM P1a, PU F4 | Camada junto à face sem vazios (pintura trata pistões como agregado) | Peso das faces `faceW` na distância | `src/worker/40_pipeline.js:61` | K27, K28 | K27 ≥ 1; K28 ≤ 0,5 mm | alta | **feito no smoke** (K27 = 2,15; K28 = 0 mm); a diferença de [W] §3.6 agora está no "Sobre o método" (PT/EN). Falta confirmar na triagem |
| A2 | PM P1b, ST 1 | Esqueleto denso nas pontas e frouxo no meio (AVC alto, sem força radial) | No Marshall/giratório, a gravidade e os golpes por face já existem; no [W], testar avisar quando k = 0 ou alternar o pistão | `25_protocolos.js` | K29, K16b | K29 ≥ 0,85 | alta | parcial (Marshall/giratório: medir; [W]: falta) |
| A3 | BR §6.3, decisão | Marshall só em tamanho real | Tirar 250 g/Ø65 do Marshall; giratório padrão 4700 g/Ø150 | `src/ui/00_base.js` (`SIZE_BY_PROTO`) | prévia + smoke | — | alta | **feito**: Marshall só 1200 g/Ø101,6; giratório Ø150 (padrão) ou Ø102; [W] 250 g ou 1000 g. O harness continua aceitando qualquer tamanho (golden [W] em 250 g) |
| A3b | usuário | O CP precisa seguir a compactação | Marshall → só CP Marshall; giratório → só CP do giratório (sem o Ø102); campo Compactação antes do CP | `head.html`, `00_base.js` | prévia | — | alta | **feito** (2026-10-30) |
| A3c | usuário | 4700 g fixos no giratório davam 103–117 mm conforme a densidade (norma: 115 ± 5 mm, AASHTO T 312 / R 35) | Massa = Gmb no AVC alvo × área × 115 mm | `10_painel.js` (`composicao`) | prévia: 4842 g na mistura padrão, 5151 g com agregado 2,90 | 115 mm | alta | **feito** (2026-10-30) |
| A3d | usuário | 1200 g fixos no Marshall davam 57,5–64,8 mm (norma 63,5 ± 1,27 mm, ASTM D6926); a energia do golpe escalava com massa/1200 | Massa para 63,5 mm no AVC alvo; no molde real (Ø ≥ 100 mm) o golpe é sempre o da norma (`massaSoquete`, JS e entrada do C); grades de calibração com `mass: 1200` para reproduzir a A5 | `10_painel.js`, `25_protocolos.js`, `26_nativo.js`, grades | entrada do C idêntica nos casos antigos (250 g e 1200 g) | 63,5 mm | alta | **feito** (2026-10-30). Na mistura padrão: 1227 g |
| A4 | BR §6.2, §5 | K33 = 6–8 % com λ 0,5 (o golpe afunda pedras pela película) | Causa: a mola de pedra tinha kn fixo e saturava em 0,25 mm (`min(-g, 0,25)`); pedras grandes, sob o golpe, afundavam além disso com força constante (todas as rodadas com K33 alto tinham penetração > 0,25 mm). Correção: kn × max(1, sa·sb/(sa+sb)) (Hertz linearizado) e trava = 0,125 × Min Feret da menor, em JS e C | `20_dem.js`, `mdsim.c` | K33, K8 | K33 ≤ 2 %; K8 ≤ 0,10 | alta | **feito**: piores casos (λ 0,5, Pb 4 %) K33 0,017–0,021 → 0,003; o AVC cai 2–3 pp e o leito solto passa de AVC 60 % para 45 % → **refazer a calibração (A5)**. Golden [W] idêntico |
| A5 | BR §6.1 | Calibração com 1 semente | Grade `calib_albayati_m2.json`: λ 0,45–0,6 × escE 0,001/0,002 × 3 sementes × 4 Pb (96 rodadas, 8 × 4 núcleos = 32) | `stress/grids/` | V1 | MAE ≤ 0,5 pp, inclinação ±30 % | alta | **feito** (2026-10-30, vid1, app com A7): λ 0,55 + escE 0,002 → AVC 6,65/4,93/3,45/2,29 × lab 6,1/4,8/3,3/2,7; MAE 0,31 pp, inclinação 128 %, K33 ≤ 0,5 %; dp entre sementes 0,5–0,8 pp. 96/96 ok. Resultado em `stress/results/vid1/calib_albayati_m2.jsonl` |
| A6 | BR §6.4 | Padrões do app (λ 0,3, escE 0,005) erram 3,7 pp | Aplicar λ/escE calibrados | `head.html`, `25_protocolos.js`, `engine.mjs` | V1, golden | MAE ≤ 0,5 pp | alta | **feito** (2026-10-30): λ 0,55, escE 0,002. Golden não muda ([W] não usa λ). Conferência com os padrões (Pb 5, s2024, Windows x16): mesmos parâmetros da A5, AVC 4,54 × 3,03 no vid1 — diferença de plataforma/threads do tamanho da variação entre sementes. Giratório: λ novo sem recalibrar a escala de pressão |
| A7 | PM P2, ST 2 | Mastique +5–11 % com p2 = 20 | A hipótese da pintura não se confirmou: o mastique é o que sobra no cilindro. Causas reais: (1) o sorteio parava no 1º candidato grande demais e deixava a massa até 3,9 % abaixo do alvo; (2) sobreposição (10–100× menor desde F1/A4); (3) régua errada no AVC livre (M15). Correção: sortear outro candidato em vez de parar (até 200) e fechar com o mais próximo | `10_formas.js` | K3 | |K3| ≤ 3 % em todas as células | alta | **feito**: nos 11 casos de 250 g que quebravam, massa ±0,5 % (antes até −3,9 %), K4 ~10× menor; K3 6 pass + 5 warn (3,2–4,7 %, todos [W] com AVC 2 % forçado → A10). Golden: NA 578 → 569 (referência regravada) |
| A8 | PM P3, ST 3 | Bolhas não cabem com AVC 12 % e B = 100 %; bolhas tocam agregado | Bolha só entra inteira no mastique (nem ela nem a casca de 1 voxel tocam agregado, parede ou vazio do esqueleto); no déficit, aviso com o B que ficou (PT/EN) e `st.bubDeficit`; harness: K5/K6 `na` no déficit declarado (categoria C) | `40_pipeline.js`, `kpi.mjs` | K5, K6, K19 | K19 = 0; |K5| ≤ 5 % | média | **feito**: K19 = 0 em todos os casos; |K5| ≤ 0,6 % onde cabe. Onde não cabe (AVC 12–18 %), B real 15–45 %, declarado. A estimativa antes de rodar não foi feita (a capacidade depende da geometria). Golden regravado (Vmast/Vbol na 3ª casa); a referência do vid1 precisa ser regravada no próximo deploy |
| A9 | PM P4, ST 5 | `placeFail` > 0 em 41 % dos casos | Resolvido na unificação (F1): a colocação nunca desiste | `25_protocolos.js` | placeFail | 0 | média | **feito** (placeFail = 0 por construção) |
| A10 | PM P5 | K8 = 0,61 isolado | No smoke, `synth-gap-p2-20` ([W], esqueleto aberto) ainda tinha K8 = 0,47 e K33 = 0,07 depois da A7: o [W] forçava a altura do AVC alvo mesmo quando o esqueleto não cabe. Agora o pistão para quando uma pedra entra > 0,1 mm em outra por 0,1 s, o CP fica com o AVC medido e o app avisa (PT/EN); JS e C | `25_protocolos.js`, `mdsim.c`, `40_pipeline.js`, `10_painel.js` | K8, K33 | ≤ 0,10 | média | **feito**: K8 0,10–0,13 (warn), K33 ≤ 0,024; golden idêntico. Novo núcleo C ainda não foi para o vid1 (a A5 está rodando) |
| A11 | PM P6 | K14 instável com k = 1 | Varredura k 0,5/1/1,5/2 × 3 sementes (250 g) e k 1/2 × 2 sementes (mistura 1 de [W], 1000 g); aviso de calibração de [W] junto do campo (PT/EN) | UI (`head.html`) | K14 | 1,3–4 | média | **feito**: o K14 cresce com k, mas a instabilidade vem do CP de 250 g (poucas pedras nas faixas da borda); em 1000 g, k = 1 dá 2,62/2,79 (dp 0,08). Os 26 da triagem eram de antes de A4/A7/A10. Padrão mantido em k = 1 |
| A12 | ST 4 | Pedras grandes no molde pequeno: quadrantes desiguais | Resolve-se em parte com A3 (tamanho real) | — | K15 | ≤ 0,25 | baixa | depende de A3 |
| A14 | novo (K30) | Topo com mais vazios que a base no protocolo [W] (golden: K30 = 0,46) | Investigar assimetria dos pistões (qual se move, ordem das fases) | `25_protocolos.js` | K30 | ≤ 0,15 | média | falta |
| A13 | BR §6.5 | Giratório sem calibração no tamanho real | Calibrar em Ø150, 4700 g | grade nova | V4, V5 | V4 RMSE ≤ 10 % | média | falta (precisa de curva h × giro do lab) |

## Bloco 3: formas, curvas, pacote e interface

| ID | Origem | Problema | Mudança | Arquivo | Prova | Prio | Status |
|---|---|---|---|---|---|---|---|
| F1 | PP 1, AG | Gerador convexo (convexidade ~0,99; real 0,66–0,81) | Sortear de `biblioteca_formas_reais.json` | `src/worker/12_formas_reais.js`, `md_core` | volume fecha; golden [W] idêntico | alta | **parcial**: no app já existem RS (F001) e RT (F001+F004) (ver C2); falta `md_core` (Python) e, se quiser, `f004_A` sozinho |
| F2 | PP 2 | Peneiras intermediárias DE AC/PA aproximadas (status 'R') | Conferir com TL Asphalt-StB 07/13; atualizar `gradation_points.csv` | curvas | — | média | **bloqueado**: preciso das tabelas da norma |
| F3 | PP 3, usuário | Artefato e pacote com HTML antigo | Sem artefato (decisão do usuário, 2026-10-30): mini app Python (pywebview) com o app atual, three.js r128 embutido (offline), `.exe` do Windows pelo PyInstaller e zip para os colegas; `pacote/build_pacote.py` refaz tudo | `pacote/` | instala e abre | média | **feito** (1.1.0a1): wheel instala limpo num venv; `.exe` (20 MB) abre a janela com o WebView2; a página do pacote carrega o three.js local e roda o CP rápido. Release prévia `v1.1.0a1` no GitHub (privada) com o zip |
| F4 | PP 4 | EN usa vírgula decimal | Ponto decimal na versão EN | `src/ui` | — | baixa | falta |
| F5 | PP 4 | Eq. 3 de [W] não serve para PA (cai em 48 %) | Sugestão de B por tipo de curva | `src/ui` | — | baixa | falta |
| F6 | PP 4 | Testes faltando | 1000 g, preset [W] completo, download do zip, pacote em macOS/Linux | — | — | baixa | falta |
| F8 | novo (K23) | Com bolhas, o STL de vazios passa de 250 mil triângulos (golden ~290 mil) | Icosaedro mais simples para bolhas pequenas, ou exportar bolhas em arquivo separado | `src/ui/30_export.js` | K23 | ≤ 250 mil | baixa | falta |
| F9 | usuário | O app precisa de ajuda, copyright e referências; o projeto, de um whitepaper | Cards Ajuda e Referências (PT/EN), rodapé © Sergio Callai, `WHITEPAPER.md` | `src/app/head.html`, `src/ui/00_base.js` | prévia PT/EN | alta | **feito** |
| F10 | usuário | No app, o Marshall de 1200 g leva ~40 min em JS | Núcleo em C (`mdsim`) dentro do mini app: o servidor local do Python serve a página e `native/mdsim` (token); o worker manda a compactação por POST síncrono e a página lê o progresso do servidor; sem o mdsim (ou se ele falhar), JS. Serialização única em `src/worker/26_nativo.js`, usada também pelo harness (`stress/native.mjs`). Só Marshall e giratório (o [W] em C reprova no golden, M14). `mdsim.exe` compilado com `-march=x86-64-v2` vai no pacote | `src/worker/25_protocolos.js`, `26_nativo.js`, `src/ui/10_painel.js`, `pacote/` | golden pela ponte nova = ponte antiga; app roda Marshall pelo C | **alta** | **em andamento**: ponte nova dá o golden C idêntico à antiga; o app chama o mdsim com 20 núcleos |
| F7 | AG | Eq. 3 (Awuah) ignora a forma: propriedades idênticas | Modelo de previsão que use força de compactação ou contatos do DEM | — | — | baixa | backlog |

## Bloco 4: desempenho

| ID | Origem | Mudança | Prova | Prio | Status |
|---|---|---|---|---|---|
| S2 | BR §6.6 | Paralelizar ou reduzir `buildPairs`, CSR e cópias da varredura em `mdsim.c` | C × JS bate; escala > 5× com 24 núcleos | **alta** (com F10) | falta. Medido 2026-10-30: Marshall 1200 g leva 1554 s com 16 threads no PC e 1613 s com 4 no vid1, ou seja, quase não escala |
| S2a–S2g | plano de desempenho, Fase 1 | Núcleo C sem mudar o resultado: varredura parcial sem cópia e CSR em paralelo, candidatos sem força marcados, conferência de movimento por partícula, SoA/SIMD em `probeIn`, uma região OpenMP por passo, `penetration` paralela; timers atrás de `MD_PROF` | referência C bit a bit com 1, 4 e 16 threads | **alta** | **feito** (2026-10-30), com uma troca: a "região OpenMP por passo" (S2f) não entrou — medida com a régua, as aberturas de região e as somas seriais ficam abaixo de 2 % do passo; no lugar, o `buildPairs` passou a rodar em paralelo com a mesma ordem de pares. Saída bit a bit igual à do código anterior em 4 casos (Marshall 250 g livre e travado, [W] 250 g, giratório 1000 g) × 2 flags (`-march=native`, `-march=x86-64-v2` do pacote) × 1 e 4 threads, e no caso do perfil (1200 g). Marshall 1200 g (5 golpes/face, 4 threads): 400,8 → 202,6 s (1,98×). Ver "S2 Fase 1" nas medições. 16 threads não foi conferido aqui (VM de 4 núcleos) |
| S2m, S2n | perfil da S2a | Extras de categoria I: o laço por partícula percorre os candidatos pelos pares (mesma ordem) e o CSR partícula → candidato deixa de existir (S2m); candidatos em faixas fixas por par, e a varredura parcial regrava só os pares revarridos (S2n) | referência C bit a bit; o rearranjo das faixas exercido com folga 0 e 2 | alta | **feito** (2026-10-30): varredura parcial do caso do perfil 154,6 → 28,6 s |
| S2h–S2l | plano de desempenho, Fase 2 | Molas somadas por par (sem CSR de candidatos), `buildPairs` com grade fina e paralelo, folgas maiores, coluna inicial mais densa, queda mais curta | calibração reduzida (12 rodadas) dentro do ruído | **alta** | falta |
| S5 | BR §6.7 | WebAssembly no navegador; botão "Abrir resultado do servidor" | Ø150 em tempo aceitável; K32 | baixa | falta |
| S6 | BR §6.8 | Escala de massa; fim do golpe pelo repouso | K12, tempo | baixa | falta |
| S6a–S6c | plano de desempenho, Fase 3 | dt 4e-5 com escala de inércia nas pedras < 3 mm; 25 golpes simulados por face; assentamento pós-golpe 0,001 s | grade de calibração completa | média | falta (depende das Fases 1–2) |

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
| C4 | O artefato v5 (`NZdqVD7NCQUwAA3bTUsTNW`) e o pacote 1.0.0 levam o HTML anterior à unificação | Republicar com o app unificado só depois de A3 e A6, para os colegas receberem a versão calibrada | **Resolvido** com a F3: não há mais artefato; o pacote 1.1.0a1 leva o app calibrado.
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

## Medições

### 2026-10-29 · bloco 0 e bloco 1 (PC, Node 24.11.1, win32-x64)

Golden e determinismo: passam antes e depois, com volumes idênticos (Vagg 52,329; Vmast 48,819; Vesq 2,192; Vbol 2,023 cm³). A mudança no worker só acrescentou o perfil `st.vface`.

| Caso do smoke | Antes | Depois | O que mudou |
|---|---|---|---|
| golden | warn (K15, K19) | D: K30 = 0,46; warn K15, K19, K23 | K30 novo detecta topo com mais vazios (A14); K23 conta as bolhas (~290 mil triângulos) |
| golden-seed2 | warn (K19) | D: K30 = 0,32 | idem |
| avc0.5 | D (K15, K16b) | D (K16b, K30 = 1,93) | K15 vira `na` (só 465 voxels de vazio num quadrante) |
| synth-gap-p2-20 | D (K8, K19, K33) | D (K8, K19, K23, K33) | — |
| one-sieve-above-2 | D | D | — |
| invalid-top-sieve | inválido | inválido | — |

Valores novos: K28 = 0 mm em 4 casos e 0,5 mm em 1 (pass): a correção das faces (A1) funciona. K13 máx 1,93 (< 2). Nenhum crash. Resultados em `stress/results/base_smoke.jsonl` e `after_smoke.jsonl`.

### 2026-10-29 · A4 (PC, Node 24.11.1, núcleo C com 4 threads)

Casos de `stress/grids/a4_k33.json` (Albayati, Marshall 1200 g, AVC livre, formas RT, λ 0,5, Pb 4 %, semente 2024), antes e depois, na mesma máquina:

| escE | | AVC previsto | K33 | Penetração máx. | Pares > 2 % | Leito solto (AVC) |
|---|---|---|---|---|---|---|
| 0,005 | antes | 4,90 % | 0,0165 | 0,29 mm | 0 | 149,8 mm (60 %) |
| 0,005 | depois | 2,83 % | **0,0036** | 0,05 mm | 0 | 108,2 mm (45 %) |
| 0,002 | antes | 8,28 % | 0,0211 | 0,37 mm | 1 | 149,8 mm (60 %) |
| 0,002 | depois | 4,89 % | **0,0034** | 0,04 mm | 0 | 108,2 mm (45 %) |

- No vid1, o mesmo caso deu AVC 6,23 % e K33 0,081 antes da correção: Windows e Linux divergem bastante numa semente só (P7). Por isso a calibração precisa de 3 sementes.
- Golden em JS: idêntico à referência (o [W] não chega a ter contato pedra-pedra). Smoke: só `synth-gap-p2-20` muda (K33 0,156 → 0,091).
- Golden pelo núcleo C: volumes iguais aos do JS, mas a parede radial dá 9,27 (falha ± 2 pp) antes e depois → item M14.

### 2026-10-29 · golden no vid1 (Linux, Node 24.11.1, JS)

- K32 (Vagg Linux × Windows): 0,020 % → pass. Determinismo: identical. Referência do Linux gravada no vid1 (`stress/golden_ref.json` de lá; trazer junto com os resultados da A5).
- Parede radial: 12,5 % no Linux contra 5,4 % no Windows (meta 6 ± 2), com os volumes iguais. A parede é a métrica mais sensível à trajetória (M10, M14): com a referência por plataforma, a regressão fica coberta pela comparação exata; a tolerância de ± 2 pp não foi alterada.

### 2026-10-29 · A7 e M15 (PC, Node 24.11.1, JS)

Os 11 casos de 250 g em que o K3 quebrava na triagem (`stress/grids/a7_k3.json`):

| Caso | K3 triagem (app antigo) | K3 antes da A7 | K3 depois | Massa sorteada antes → depois |
|---|---|---|---|---|
| S28 s23 | 0,102 | 0,065 | **0,021** | −2,67 → −0,36 % |
| S10 s11 | 0,093 | 0,035 | **0,013** | −1,14 → −0,32 % |
| S09 s23 | 0,112 | 0,050 | 0,045 (warn) | −0,62 → −0,14 % |
| S17 s11 | 0,083 | 0,042 | 0,046 (warn) | +0,32 → +0,04 % |
| S17 s23 | 0,106 | 0,045 | 0,045 (warn) | +0,10 → +0,08 % |
| C0 s23 | 0,064 | 0,047 | **0,008** | −3,88 → −0,30 % |
| S28 s37 | 0,111 | 0,084 | **0,004** | −3,63 → +0,52 % |
| S09 s37 | 0,133 | 0,078 | 0,032 (warn) | −1,64 → −0,10 % |
| S17 s37 | 0,095 | 0,049 | 0,047 (warn) | −0,04 → −0,01 % |
| S18 s11 | 0,060 | 0,024 | **0,007** | −0,64 → +0,02 % |
| S18 s37 | 0,061 | 0,019 | **0,007** | −0,47 → −0,02 % |

Os 5 warns têm sobreposição de 0,4–1 % (K7) e K33 alto: são casos [W] com AVC 2 % em que o pistão força a altura (A10). Golden: NA 569, demais valores dentro da tolerância, verdict warn (o K30 deixou de quebrar nesta semente). Smoke: sem crash.

**Atenção:** a grade A5 no vid1 começou antes da A7 (sorteio antigo). Nos casos de 1200 g da calibração o déficit de massa era de até 0,74 %.

### A10 (2026-10-29): [W] com esqueleto que não cabe no AVC alvo

Grade `stress/grids/a10_k8.json` (os casos com K8 alto da A7 e do smoke), PC local, Node 24.11.1. Antes = `a7_after.jsonl` / `a7_smoke.jsonl`; depois = `a10_k8.jsonl`.

| Caso | AVC alvo | K8 antes → depois | K33 antes → depois | AVC final |
|---|---|---|---|---|
| synth-gap-p2-20 | 4 | 0,473 → 0,105 | 0,070 → 0,013 | 12,5 % |
| S09 s23 | 2 | 1,432 → 0,099 | 0,179 → 0,006 | 14,7 % |
| S17 s11 | 2 | 1,154 → 0,125 | 0,161 → 0,019 | 16,6 % |
| S18 s37 | 12 | 0,488 → 0,121 | 0,093 → 0,023 | 18,0 % |
| S10 s11 | 12 | 0,224 → 0,125 | 0,048 → 0,024 | 13,2 % |

Primeira versão (parar no primeiro passo acima de 0,1 mm): synth-gap ficava em AVC 13,0 %. Com a espera de 0,1 s para as pedras se rearranjarem, 12,5 %; nos demais o ganho foi pequeno, porque sem atrito e com o pistão parado a carga não sai do contato. O K8 final fica um pouco acima de 0,10 (warn) pela acomodação depois da parada.

Golden e determinismo: idênticos (o limite nunca é atingido). Smoke (`a10_smoke.jsonl`): os outros 4 casos com KPIs idênticos. Continuam quebrando nos casos travados K5/K6/K19/K23: as bolhas da Eq. (3) não cabem com AVC de 12–18 % (A8). No harness, o K1 vira `na` quando o esqueleto trava (`flags.skelLocked`), e K16b/K28/K30 usam o AVC do CP.

### A8 (2026-10-29): bolhas inteiras no mastique

Grade `stress/grids/a8_bolhas.json`, PC local, Node 24.11.1. Antes = `a10_smoke.jsonl` / `a10_k8.jsonl`; depois = `a8_bolhas.jsonl`.

| Caso | B pedido | K19 antes → depois | K5 antes → depois | B real antes → depois |
|---|---|---|---|---|
| golden (semente 2024) | 48 | 0,0019 → 0 | 0,000 → 0,000 | 48,0 → 48,0 |
| golden-seed2 | 48 | 0,0020 → 0 | 0,000 → 0,001 | 48,0 → 48,0 |
| avc0.5 | 48 | 0,0018 → 0 | 0,016 → 0,006 | 48,4 → 48,2 |
| one-sieve-above-2 | 29 | 0,0001 → 0 | 0,000 → 0,001 | 28,9 → 28,9 |
| synth-gap-p2-20 (AVC 12,5) | 48 | 0,0359 → 0 | −0,61 → −0,69 (na) | 18,8 → 14,8 |
| S09 s23 (AVC 14,7) | 100 | 0,0158 → 0 | −0,49 → −0,55 (na) | 50,9 → 45,1 |
| S18 s37 (AVC 18,0) | 100 | 0,0157 → 0 | −0,58 → −0,63 (na) | 41,7 → 37,2 |

Onde as bolhas não cabem, a regra estrita cabe um pouco menos (antes, parte das bolhas encostava na pedra ou se fundia com vazios do esqueleto). O que sobra nesses casos é K23 (malha grande, F8) e K30 (A14). Golden: verdict warn (K15, K23, K30 = 0,16); Vmast 48,752 → 48,753, Vbol 2,024 → 2,023; determinismo idêntico; referência win32 regravada.

### A11 (2026-10-30): banheira radial (K14) × força radial k

Grade `stress/grids/a11_segk.json`, PC local, Node 24.11.1, [W], AVC travado → `stress/results/a11_segk.jsonl`.

| Tamanho | k | K14 por semente | Média | dp | Vazios na borda / miolo (%) | K17 |
|---|---|---|---|---|---|---|
| 250 g, C-12,5 | 0,5 | 2,33 · 2,06 · 1,71 | 2,03 | 0,25 | 7,0 / 3,50 | 0,79 |
| 250 g | 1 | 2,19 · 4,04 · 2,82 | 3,02 | 0,77 | 8,8 / 2,95 | 0,56 |
| 250 g | 1,5 | 3,45 · 7,44 · 1,84 | 4,24 | 2,35 | 7,4 / 1,99 | 0,50 |
| 250 g | 2 | 4,91 · 3,46 · 3,23 | 3,87 | 0,75 | 7,6 / 1,96 | 0,53 |
| 1000 g, mistura 1 de [W] | 1 | 2,62 · 2,79 | 2,70 | 0,08 | 21,3 / 7,87 | 0,49 |
| 1000 g | 2 | 3,70 · 2,92 | 3,31 | 0,39 | 23,4 / 7,16 | 0,46 |

No CP de 250 g uma única faixa da borda vai de 2,5 a 29,7 % de vazios entre sementes: são cordas do círculo com poucos voxels. Mais força tira vazios do miolo (3,5 → 2,0 %) e não muda a borda. Em 1000 g o K14 é estável. Decisão: manter k = 1 e avisar no app. Não mexi no KPI; uma alternativa futura é medir a banheira em anéis (raio) em vez de faixas do diâmetro.

### S2 Fase 1 (2026-10-30): núcleo C 2× mais rápido com o mesmo resultado

Régua: `MD_PROF=1` imprime no stderr o tempo por etapa e as contagens (S2a; no harness, `MD_PROF=1 MD_VERBOSE=1`). Caso do perfil (Marshall 1200 g, 5 golpes simulados por face, semente 2024, 108 250 passos, 2244 partículas, ~12 mil pares e ~61 mil candidatos por passo), VM de nuvem com 4 núcleos, `gcc -O3 -march=native -fopenmp`, uma rodada de cada vez. A base (S2a) foi medida de novo nas mesmas condições: 400,8 s (o perfil de 487 s do plano foi tirado com a máquina dividida; esta VM oscila, e as etapas curtas — rotações, integração — são as que mais sentem). A saída (posições, orientações, quadros, histórico, traço e penetração) é idêntica bit a bit à do código anterior em todos os casos conferidos, com 1 e 4 threads e com as duas flags (native e x86-64-v2).

| Etapa | Antes (S2a) | Depois (S2n) | |
|---|---|---|---|
| Lista de pares (`buildPairs`, 3227 vezes) | 19,9 s | 5,9 s | S2f: paralelo com a mesma ordem |
| Rotações + conferência de movimento | 12,5 + 8,5 s | 12,6 s | S2d: limite por partícula antes de olhar os pontos |
| Varredura completa (3228 vezes) | 46,6 s | 29,1 s | S2b, S2e, S2m |
| Varredura parcial (85 602 vezes) | 154,6 s (33,8 s seriais) | 28,6 s | S2b, S2m, S2n: sem cópia dos 61 mil candidatos, sem CSR, pares revarridos distribuídos |
| Forças por par | 95,0 s | 73,7 s | S2c: sem zerar 80 B por candidato |
| Forças por partícula | 57,5 s | 47,6 s | S2c, S2d (paredes só para grãos perto delas) |
| Integração e somas | 5,8 s | 5,0 s | |
| **Total do DEM, 4 threads** | **400,8 s (3,70 ms/passo)** | **202,6 s (1,87 ms/passo)**; repetição 204,1 s | **1,98×** |
| Total do DEM, 1 thread | ~920 s (4 threads = 2,3× uma, no plano) | 687,3 s (6,35 ms/passo) | 4 threads = **3,4×** uma thread |

Por item, nos casos pequenos (4 threads salvo nota; tempos de parede, sujeitos à oscilação da VM): S2b m250 1 thread 99,6 → 94,3 s (a parte serial da varredura, 3,6 s, some); S2d w250 24 → 16 s e m250 1 thread 94 → 84 s; S2e m250 1 thread 83,5 → 80,6 s; S2f g1000 142 → 128 s; S2g penetração < 1 s; S2m g1000 128 → 121 s; S2n g1000 varredura parcial 17,6 → 15,3 s (no 1200 g, 92 → 29 s).

Cuidado com o número de threads: com mais threads que núcleos as barreiras do OpenMP (espera ativa) ficam muito lentas — nesta VM de 4 núcleos, uma rodada de 4 threads com um processo a mais ao lado levou 15× o tempo. O app chama o `mdsim` com 20 núcleos; num PC de 16 threads o certo é ≤ 16 (ou `OMP_WAIT_POLICY=passive`). Fica como item de acompanhamento na F10.

### F10 e S2 (2026-10-30): núcleo em C no app e onde vai o tempo

**JS × C no mesmo caso** (Marshall 1200 g, Albayati Pb 5, semente 2024, padrões da A6, PC Windows): JavaScript 4549 s (76 min; parte do tempo dividindo a máquina com outro cálculo) × núcleo C com 16 threads 1578 s (26 min): **C ~2,9× mais rápido**. Resultados: `stress/results/f10_js_marshall.jsonl`, `a6_defaults.jsonl`.

**Giratório pelo C** (Ø102 mm, 1000 g, 30 giros simulados): 7,7 min, AVC 12,6 % (escala de pressão não calibrada), K33 0,3 %, K19 0 (`f10_gir_c.jsonl`).

**Perfil do mdsim** (Marshall 1200 g, 5 golpes simulados por face, 8 threads, cópia instrumentada; a máquina estava dividida com outro mdsim, então os números absolutos estão inflados): 93 650 passos; a varredura de candidatos rodou em 75 554 (81 %).

| Parte | % do tempo | Roda em |
|---|---|---|
| Varredura de candidatos (busca) | 24 | paralelo |
| Varredura: cópia + CSR | 14 | 1 núcleo |
| Forças por par | 19 | paralelo |
| Forças por partícula | 19 | paralelo |
| Montagem dos pares | 5 | 1 núcleo |
| Rotações, conferência de movimento, somas | ~19 | parte em 1 núcleo |

S2 começa pela varredura: refazer só o que mudou e em paralelo, e revarrer menos vezes (sem mudar o golden do C).
