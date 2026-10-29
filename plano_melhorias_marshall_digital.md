# Marshall Digital: problemas, melhorias e metas de KPI

Base para um plano de melhoria do app `marshall_digital_app.html`.
Fonte: triagem da Fase 1 do harness de estresse (`stress/`, KPIs K1–K23 de `Marshall_digital_stress_test.md`) e uma análise do perfil vertical de vazios. Data: 2026-10-28.

## 0. Contexto em poucas linhas

- **O que o app faz:** compactação DEM de agregados entre dois pistões (sem gravidade e sem atrito), depois pintura do mastique em voxels a partir das bordas dos agregados e das paredes, e por fim a semeadura de bolhas. O método segue Wan et al. 2024 ([W]).
- **O que o harness faz:** extrai o código do worker do HTML, roda os casos em Node e dá a cada caso pass / warn / C / D (quebra) por KPI.
- **Desenho da triagem:** fatorial fracionado 2^(9-4) com ponto central × 3 sementes, total de 99 casos. Esta análise usa 78 deles. Os 9 fatores são:

  | Código | Fator | Nível baixo | Nível alto |
  |---|---|---|---|
  | A | AVC (%) | 2 | 12 |
  | B | Pb (%) | 3,5 | 7,5 |
  | C | p2, passante em 2 mm (%) | 20 | 58 |
  | D | Dmax (mm) | 12,5 | 25 |
  | E | graduação | densa | descontínua |
  | F | tamanho do CP | 250 g / Ø65 | 1000 g / Ø102 |
  | G | biblioteca de formas | calcário | granito |
  | H | força radial k | 0 | 2 |
  | J | bolhas | desligadas | manual, B = 100 % |

- **Resultado geral:** 62 casos D, 6 C, 10 warn e 0 pass. Não houve crash, hang nem OOM. O app é robusto (sempre termina), mas quase todo caso viola algum KPI. Parte disso são limites mal calibrados (seção 2).

---

## 1. Problemas do simulador

### P1. Perfil vertical de vazios invertido (prioridade alta)

Em CPs reais (Marshall e giratório), a tomografia mostra **mais vazios junto às duas faces** (topo e base) e um miolo mais denso. Esse é o perfil vertical em "banheira" (Masad et al. 1999; Tashman et al. 2001; conferir com referência de Marshall especificamente). No app acontece o contrário.

**Por terços (78 casos):**

| AVC alvo | Terço inferior | Terço do meio | Terço superior | Terço com mais vazios (inf / meio / sup) |
|---|---|---|---|---|
| 2 % | 1,37 % | 2,89 % | 1,76 % | 6 / 22 / 12 |
| 12 % | 8,59 % | 17,69 % | 9,76 % | 3 / 30 / 7 |

**Perfil fino (fatias de 0,25 mm).** Foram 10 casos de 250 g sem força radial: as 8 células da triagem com semente 11, mais o golden com sementes 2024 e 2. As colunas dão a distância até a face mais próxima.

| Caso | AVC | Vazios 0–1 mm | Vazios 1–2 mm | Vazios 2–4 mm | Vazios no miolo (terço central) | Agregado 0–1 mm | Agregado 2–4 mm | Agregado no miolo |
|---|---|---|---|---|---|---|---|---|
| golden s2024 | 4 | 2,7 | 6,5 | 5,0 | 4,3 | 3,6 | 56 | 50 |
| golden s2 | 4 | 2,8 | 6,7 | 6,5 | 4,2 | 6,7 | 54 | 51 |
| S03 | 2 | 0,6 | 4,0 | 1,1 | 2,5 | 25 | 71 | 64 |
| S09 | 2 | 3,2 | 5,2 | 1,6 | 1,8 | 23 | 73 | 73 |
| S17 | 2 | 0,4 | 4,3 | 1,2 | 2,3 | 27 | 79 | 71 |
| S27 | 2 | 1,4 | 4,7 | 2,4 | 2,1 | 17 | 66 | 67 |
| S06 | 12 | 5,9 | 13,2 | 4,5 | **20,6** | 1,1 | 52 | **21** |
| S16 | 12 | **0,0** | **0,0** | 4,2 | **23,1** | 0,7 | 44 | **24** |
| S24 | 12 | 2,4 | 9,6 | 7,6 | **19,4** | 0,7 | 44 | **19** |
| S30 | 12 | **0,0** | 0,5 | 7,9 | **22,1** | 1,1 | 43 | **27** |

Valores em % de volume. Dados brutos: `analise_perfil_vertical/summary.json`.

Há dois mecanismos distintos:

- **P1a. Camada de mastique sem vazios na face.**
  - Nos primeiros 0–2 mm quase não há agregado, que não se encaixa contra a face plana. Esse efeito de parede é correto.
  - Porém, nessa camada também não há vazio. Em S16 e S30, as 9 primeiras fatias (2,25 mm) têm 0 % de vazios.
  - **Causa:** a pintura do mastique (`marshall_digital_app.html:806-830`, [W] §3.6) usa uma distância que trata as faces dos pistões como parede e agregado (`lim = min(3*(zz+1), 3*(nz-zz))`). Os vazios vão para os voxels mais longe de tudo, ou seja, longe das faces.
  - No CP real, essa camada junto à face tem **mais** vazios, não menos.
- **P1b. Esqueleto denso nas pontas e frouxo no meio (AVC alto).**
  - Com AVC 12 % e p2 = 58, a fração de agregado é ~44–52 % a 2–4 mm da face, mas só ~19–27 % no miolo.
  - Parece um efeito da compactação DEM sem gravidade e sem atrito. Os pistões empacotam as pontas, e o centro fica com poucas partículas e muito mastique e vazio.
  - Com AVC 2–4 % o esqueleto é quase uniforme (golden: 56 contra 50 %), e o perfil de vazios até mostra um pico leve a 1–2 mm da face.
- **Diferença topo/base:** nos casos de AVC 12 % o topo tem um pouco mais de vazios que a base (média 9,8 contra 8,6 %). Investigar se é assimetria dos pistões.

### P2. Excesso de mastique em misturas graúdas

- K3 (erro do volume de mastique) é a segunda maior causa de quebra.
- **Com p2 = 20:** mediana +5,6 %, quebra em 14 de 37 casos.
- **Com p2 = 58:** quebra em 0 de 39.
- O efeito estimado de p2 sobre K3 é −0,051, o Pb vem em segundo (−0,018) e há interação Pb × p2.
- **Hipótese:** o fechamento de volume na pintura em voxels erra quando o esqueleto é aberto (poucos finos, Dmax 25).

### P3. Bolhas não cabem no mastique com AVC alto

- **Onde ocorre:** modo manual com B = 100 % e AVC 12 %, em 9 de 18 casos com `bubbleDeficit`. Ali K6 ≈ −50 pp e K5 ≈ −50 %, ou seja, metade das bolhas pedidas vira vazio de esqueleto.
- **Bolhas encostadas no agregado:** nesses casos 1,5–4 % dos voxels de bolha tocam agregado (K19), e K19 quebra 10 vezes. O limite é 0.
- **Com AVC 2 %:** não ocorre.

### P4. Falha na colocação de partículas

- `placeFail > 0` em 31 de 78 casos, com no máximo 7 partículas por caso. Ocorre mais em 250 g (21 de 43) do que em 1000 g (10 de 35).
- A massa por fração (K4) continua dentro do limite, mas esses casos caem para a categoria C.
- O app não diz quais frações falharam.

### P5. Penetração isolada alta

- K8 (penetração máxima / 1 mm) = 0,61 em S01|seed=11 e 0,24 em S17|seed=11. Nos demais casos a mediana é 0,004.
- Pode ser um passo de tempo grande para partículas grandes ou um contato perdido.

### P6. Força radial: banheira radial instável no ponto central

- **K14 (banheira radial):** mediana 26,5 com k = 1 (ponto central, 2 sementes), contra 3,0 com k = 2 e 1,3 com k = 0. O desvio entre sementes no ponto central é 18.
- **K17 (segregação):** 1,19 com k = 0, 0,72 com k = 1 e 0,42 com k = 2. A força radial separa bastante finos e graúdos.
- Falta confirmar se isso é físico ou se deve ser limitado. A força de [W] foi calibrada só para a mistura 1 com 50 golpes por face.

### P7. Reprodutibilidade entre máquinas

- Mesmo spec e mesma semente dão trajetórias DEM diferentes entre Node 22 e Node 24, e também entre Windows e Linux com o mesmo Node 24.11.1. Exemplo: Vagg do golden = 51,684 no PC contra 51,678 no vid1.
- Na mesma máquina o resultado é bit-idêntico (K26 ok).
- Com Node 22 o golden falha na parede radial (14,5 contra 8,6 ± 2).

---

## 2. Problemas dos KPIs (medição)

| # | KPI | Problema | Evidência |
|---|---|---|---|
| M1 | K16 vertRatio (máx/mín AVC dos terços) | Razão mal condicionada quando um terço tem ~0 vazios | S31: terço inferior 0,001 % → K16 = 3105; quebra 43 de 78 |
| M2 | K16 | Terços inteiros diluem a camada da face (P1a) | camada de 0–2 mm sem vazios não aparece nos terços |
| M3 | K9 outside | Limite de pass 1e-9 inatingível com amostragem em voxels | warn em 77 de 78 casos; mediana 9e-4 |
| M4 | K15 quadCV | Ruído amostral com poucos voxels de vazio por quadrante | 250 g com AVC 2 %: mediana 0,28; ponto central: 0,79 |
| M5 | K23 meshTri | Conta só a malha dos vazios de esqueleto. Com B = 100 % dá 0 e passa sem significado | 0 nos 27 casos com bolhas manuais |
| M6 | K13 keBlowup | Limite 10 nunca é tocado | máx 0,95 |
| M7 | K11b gapErr | Exato por construção, não discrimina nada | ≈ 1e-14 em todos |
| M8 | K1, K2, K4, K10, K11, K12 | Nunca ou quase nunca disparam nesta grade | podem ficar como guardas de regressão |
| M9 | "broke" binário | 87 % dos casos quebram, então o efeito dos fatores some na resposta binária | usar os KPIs contínuos (`effects.mjs`) |
| M10 | Golden, parede radial ± 2 pp | Só a semente leva o valor de 9,8 a 17,8, e a plataforma também muda o valor | falha com Node 22 |

---

## 3. Metas de KPI

Onde está "a calibrar", ainda falta uma referência medida (CT de CPs reais ou literatura de Marshall). Os números propostos são o ponto de partida.

### 3.1 KPIs existentes

| KPI | Atual (mediana / pior) | Meta pass | Meta warn | Observação |
|---|---|---|---|---|
| K1 erro AVC (pp) | 5e-6 / 0,05 | ≤ 0,1 | ≤ 0,3 | já atingido |
| K2 fechamento agregado | −0,6 % / −6 % | \|x\| ≤ 2 % | ≤ 5 % | 1 quebra; manter |
| K3 erro mastique | +2,3 % / +13 % | \|x\| ≤ 3 % **em todas as células** | ≤ 6 % | hoje falha com p2 = 20 (P2) |
| K4 fechamento por fração | 0,28 / 0,74 partícula | ≤ 1 | ≤ 2 | já atingido |
| K5 erro volume bolhas | 0 / −50 % | \|x\| ≤ 5 % | ≤ 15 % | ou avisar antes de rodar quando não cabe (P3) |
| K6 gap B (pp) | 0 / −50 | \|x\| ≤ 2 | ≤ 5 | idem |
| K7 overlap | 1,4 % / 3,0 % | ≤ 2 % | ≤ 4 % | 19 warns; sobe com p2 baixo e 1000 g |
| K8 penetração máx / 1 mm | 0,004 / 0,61 | ≤ 0,10 | ≤ 0,25 | eliminar os outliers (P5) |
| K9 fora do cilindro | 9e-4 / 8e-3 | **≤ 1e-3** (era 1e-9) | ≤ 5e-3 | recalibrar (M3) |
| K12 KE residual | 4e-4 / 1e-3 | ≤ 1e-3 | ≤ 1e-2 | já atingido |
| K13 blowup | 0,86 / 0,95 | **≤ 2** (era 10) | ≤ 5 | apertar para ter poder (M6) |
| K14 banheira radial (só com força radial) | 1,9 / 26 | 1,3–4 | 1,0–6 | adicionar um teto; hoje só tem piso |
| K15 quadCV | 0,16 / 1,61 | ≤ 0,25 | ≤ 0,50 | só avaliar com ≥ N voxels de vazio por quadrante (M4) |
| K16 (substituir por K16b) | 1,83 / 3105 | — | — | ver K16b |
| K19 bolha tocando agregado | 0 / 4,4 % | 0 | ≤ 0,5 % | hoje quebra com AVC 12 % |
| K21 tempo de parede | 250 g: 77 s · 1000 g: 522 s (máx 1518 s) | 250 g ≤ 120 s · 1000 g ≤ 600 s | 2× | |
| K22 heap | máx 347 MB | ≤ 1 GB | ≤ 2 GB | já atingido |
| K23 malha | 0–226 mil triângulos | ≤ 250 mil, contando vazios + bolhas | | corrigir a contagem (M5) |
| placeFail | 31 de 78 com > 0 | 0 | ≤ 2 partículas | e registrar a fração |

### 3.2 KPIs novos propostos

| KPI | Definição | Meta pass | Meta warn | Situação hoje |
|---|---|---|---|---|
| **K16b** uniformidade vertical | máx − mín do AVC dos terços, em pp, dividido pelo AVC alvo | ≤ 0,30 | ≤ 0,60 | AVC 12 %: (17,7 − 8,6)/12 ≈ 0,76 |
| **K27** vazios na face | AVC médio a 0–4 mm das faces ÷ AVC do terço central | ≥ 1,0 (a calibrar, real costuma ser > 1) | ≥ 0,7 | AVC 12 %: 0,09–0,35 · golden: 1,1 |
| **K28** camada sem vazio | espessura da camada junto à face com AVC < 0,25 × AVC alvo | ≤ 0,5 mm | ≤ 1 mm | S16 e S30: 2,25 mm |
| **K29** uniformidade do esqueleto | fração de agregado no miolo ÷ fração a 2–8 mm das faces | ≥ 0,85 | ≥ 0,70 | AVC 12 %: 0,4–0,6 · golden: 0,9 (medido com a faixa de 2–4 mm) |
| **K30** simetria topo/base | \|AVC 0–4 mm topo − base\| ÷ AVC alvo | ≤ 0,15 | ≤ 0,30 | S30: (7,3 − 0,8)/12 = 0,55 |
| **K31** perfil vertical fino | o app guarda e mostra o perfil vertical em 20 fatias, como já faz com o radial | existir | — | não existe |
| **K32** reprodutibilidade | mesmo spec e semente: diferença de Vagg entre plataformas | ≤ 0,05 % (ou registrar a plataforma) | ≤ 0,5 % | 0,012 % (PC × vid1) |

---

## 4. Melhorias propostas (por prioridade)

### Alta

1. **Pintura do mastique sem favorecer as faces (P1a).** Na distância usada para pintar (`lim` em `marshall_digital_app.html:809`), deixar de tratar as faces dos pistões como agregado. Outra opção é adicionar um termo que aumente a chance de vazio junto às faces. Valide com K27 e K28 e confira com [W] §3.6 se as paredes que contam como agregado incluem os pistões.
2. **Compactação mais uniforme na altura (P1b).** Possibilidades a testar: gravidade e atrito leve na fase 2, alternar o pistão ativo (como os golpes por face do Marshall), ou um pré-adensamento com sacudida. Valide com K29 e K16b.
3. **Mostrar e salvar o perfil vertical (K31).** É o mesmo cálculo do radial, por fatia de altura. Também é uma ferramenta de diagnóstico para as melhorias 1 e 2.
4. **Fechamento de volume do mastique em misturas graúdas (P2).** Investigar a conversão de voxels em `convert()` quando o esqueleto é aberto. Meta: \|K3\| ≤ 3 % também com p2 = 20.

### Média

5. **Bolhas (P3).** Antes de rodar, estimar se o mastique comporta o B pedido. Se não comportar, limitar B e avisar no formulário em vez de completar com vazio de esqueleto. Também impedir a semeadura encostada no agregado (meta K19 = 0).
6. **`placeFail` (P4).** Registrar fração, tamanho e número de tentativas, aumentar as tentativas ou relaxar a posição antes de desistir. Meta: 0.
7. **Outliers de penetração (P5).** Limitar o passo pelo menor tamanho, ou detectar contato perdido. Meta: K8 ≤ 0,10 em todos os casos.
8. **Força radial (P6).** Pôr um teto em K14 e checar por que k = 1 é mais instável que k = 2. Mostrar no app o aviso de calibração de [W] junto do campo.

### Harness e processo

9. **Corrigir as métricas M1–M5** (K16 → K16b, K9, K15, K23) e implementar K27–K30 em `stress/kpi.mjs`.
10. **Recalibrar os limites** depois da triagem completa, como o §5 do spec prevê, e analisar efeitos pelos KPIs contínuos.
11. **Reprodutibilidade (P7, M10).**
    - Fixar Node 24.11.1 em `stress/server/deploy.sh` e `server_run.sh`. Hoje isso está ajustado só na cópia do vid1.
    - Gravar Node, SO e hash do app em cada linha do jsonl.
    - No golden, guardar a referência por plataforma ou alargar a parede para ± 6 pp, e manter o K26 (determinismo) como guarda.
12. **Fase 2 focada.** Os fatores dominantes são p2, AVC, força radial e bolhas. Um varrimento p2 × AVC × bolhas (250 g, 5 sementes) mede P1–P3 com mais poder do que repetir a fração completa.
13. **Validação com CPs reais.** Uma ou duas tomografias de CPs Marshall do laboratório dariam a referência para K27–K30 e para o perfil radial.

---

## 5. Arquivos de apoio (no vid1, `/data/callai/workspace/3dpave_stress/`)

- **`stress/results/screening.jsonl`:** resultados da triagem (a grade completa sai em `screening.report.txt` e `screening.effects.txt`).
- **`analise_perfil_vertical/vprof.mjs`:** roda um caso e devolve o perfil vertical por fatia (agregado, mastique, vazio de esqueleto, bolha). Uso: `node vprof.mjs stress/engine.mjs '<spec json>'`.
- **`analise_perfil_vertical/analyze.mjs`:** resume os perfis por distância às faces.
- **`analise_perfil_vertical/summary.json`:** os 10 perfis usados na seção 1.
