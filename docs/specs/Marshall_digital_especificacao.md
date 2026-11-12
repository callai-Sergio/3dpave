# Marshall Digital: especificação do app (método de Wan et al., 2024)

> **Como usar este documento:** cole-o inteiro numa conversa nova com o Claude e peça:
> *"Crie um artefato HTML seguindo exatamente esta especificação."*
> Ele descreve tudo o que o app precisa fazer, com os números, as fórmulas e os algoritmos.
> A única dependência externa é a biblioteca de faixas granulométricas da pasta `Granulometrric curves` (seção 3.1), que deve ser embutida no HTML.
>
> Implementação de referência: `marshall_digital_app.html` (mesma pasta).

---

## 1. Objetivo

Criar um **artefato HTML único** que gera e mostra em 3D um **corpo de prova virtual de mistura asfáltica**, com agregados, mastique, vazios e bolhas. O método é o do artigo:

> **[W]** Wan, L.; Garcia-Hernández, A.; Dopazo-Hilario, S.; Cui, G.; Liu, P. (2024). *Algorithms to create realistic virtual asphalt mixtures*. Computers and Structures 298, 107391. https://doi.org/10.1016/j.compstruc.2024.107391 (PDF em `papers/`).

O fluxo segue a Fig. 9 de [W]:

1. calcular massas e volumes a partir da composição;
2. criar os agregados virtuais com Min Feret ≥ 2 mm, com forma pela [W] Tabela 2;
3. colocá-los num tubo, misturar e compactar com dois pistões até o AVC alvo, com a força radial do efeito "castanha-do-pará";
4. **pintar o mastique** sobre o esqueleto (betume + fíler + finos < 2 mm) e semear as **bolhas de ar**;
5. mostrar o resultado em 3D, com cortes e seções tipo tomografia, e validar como em [W]: AVC por quadrante, perfil radial de vazios e forma dos agregados nas seções;
6. exportar em STL.

**Extra (não é o foco):** a previsão de trabalhabilidade, estabilidade, fluência e vazios de

> **[A]** Awuah, F.K.A.; Garcia-Hernandez, A.; Valentin, J. (2024). *A digital design method for asphalt mixtures that incorporates aggregate geometry*. Construction and Building Materials 416, 135281.

aparece numa ficha separada, marcada como referência (seção 8.2). "[W] Eq. (3)" e "[A] Eq. (3)" são equações diferentes; sempre citar a fonte.

**Agregados reais:** a pasta `Aggregate types` vai trazer formas medidas (tomografia SMA 11 S e malhas STL escaneadas). Até ela ficar pronta, o app usa as formas previstas por [W] (Tabela 2). O código deve isolar a biblioteca de formas para que ela possa ser trocada depois.

Tudo roda no navegador, em JavaScript.

---

## 2. Restrições técnicas do artefato (obrigatórias)

- Um único arquivo HTML, com CSS e JS inline.
- Biblioteca 3D: **three.js r128 em UMD**, carregada com
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>`.
  **Não usar** `import`, `importmap` nem módulos ES. Uma versão anterior ficava travada em "carregando" por isso.
- Controle de câmera próprio, sem o OrbitControls externo (seção 9.2).
- API do r128: `texture.encoding = THREE.sRGBEncoding`, `renderer.outputEncoding = THREE.sRGBEncoding` e `color.convertSRGBToLinear()`. **Não** usar `colorSpace` nem `SRGBColorSpace`.
- Nada de `fetch` a outros sites, `alert()`, `confirm()` ou `window.print()`.
- **Download:** o artefato não aceita `.stl` direto. Os STL binários vão num **`.zip`** (armazenamento sem compressão, com CRC32), salvo pela capacidade `downloads` do artefato. Como alternativa, o app gera o STL ASCII numa caixa de texto com o botão **"Copiar"**.
- Simulação pesada num **Web Worker criado a partir de um Blob**, com o código num `<script type="text/x-worker">`, e barra de progresso.
- Toda a inicialização dentro de `try/catch`; um erro aparece na área do 3D.
- Interface em **português do Brasil**, com vírgula decimal.
- Celular: uma coluna abaixo de 960 px, toque para girar e pinça para zoom.
- Tema claro e escuro, com tokens CSS em `:root` e `@media (prefers-color-scheme: dark)`.

---

## 3. Entradas

### 3.1 Curva granulométrica: biblioteca da pasta `Granulometrric curves` (padrão)

A fonte é `Granulometrric curves/data/gradation_points.csv`, a biblioteca gradlib v1.0, com 40 faixas e 292 pontos. Cada ponto tem peneira, `pass_min`, `pass_max`, `limit_type` e `status`.

| Status | Significado | No app |
|---|---|---|
| V1 | Fonte primária (texto oficial) | usar |
| V2 | Fonte secundária que reproduz a norma | usar |
| K | Conhecimento prévio, a conferir | usar, com a etiqueta "K" em vermelho |
| P | Pendente, sem valor | **descartar** |

Regras para embutir:

- descartar as linhas `limit_type = PCS_limiar`;
- descartar os pontos `P`;
- descartar as curvas que ficarem com menos de 4 pontos. Hoje isso tira as 17 curvas AC e PA da TL Asphalt-StB, e sobram **23 faixas**: DNIT 031/2024 (A-25, B-19, C-12,5, D-9,5), DNIT 031/2006 (A, B, C), AASHTO M 323 (6 curvas de pontos de controle), AASHTO M 325 SMA (5) e TL Asphalt SMA (5).

**Curva de projeto = meio da faixa**, `(pass_min + pass_max)/2`, como `gradlib.envelope`. Se faltar um dos limites (ponto de controle "só máximo"), usar o que existe. As curvas M 323 têm só pontos de controle Superpave; indicar isso no nome.

**Padrão do app: DNIT 031/2024-ES, Faixa C-12,5**, a mesma do exemplo `exemplo_12,5mm.png`. Meio da faixa:

| Peneira (mm) | 19,1 | 12,7 | 9,5 | 6,3 | 4,8 | 2,36 | 1,18 | 0,6 | 0,3 | 0,15 | 0,075 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Faixa (%) | 100 | 90–100 | 73–89 | 53–78 | 44–72 | 28–58 | 17–45 | 11–35 | 6–25 | 3–17 | 2–10 |
| Projeto (%) | 100 | 95 | 81 | 65,5 | 58 | 43 | 31 | 23 | 15,5 | 10 | 6 |

Interface:

- seletor agrupado por país: Brasil, EUA, Alemanha, mais as 14 misturas de [W] (seção 3.3);
- tabela editável (peneira | % passante | faixa min–max com o status | remover), com botão para adicionar linha;
- valor fora da faixa fica em vermelho;
- gráfico da curva no eixo **potência 0,45**, como o exemplo da pasta: faixa sombreada, curva de projeto, linha de densidade máxima `100·(d/Dmáx)^0,45` tracejada e uma linha vertical em 2 mm, a partir da qual os agregados entram na simulação;
- abaixo do seletor: família, edição, TNM, Dmáx e o número de valores K a conferir.

**Interpolação** em peneiras que não estão na lista, como 2 mm: linear em log da abertura, como `gradlib.interp(space="log")`.

### 3.2 Demais campos

| Campo | Padrão | Observação |
|---|---|---|
| Nome | designação da faixa (C-12,5) | |
| Agregado | **Calcário (L1–L5)** ou Granito (G1–G5) | [W] Tabela 2 (seção 5.1) |
| Teor de betume (% da massa total) | 5,5 | validar entre 2 e 10% |
| Vazios de ar alvo, AVC (%) | 4,0 | validar entre 0,5 e 30% |
| Densidade do agregado (g/cm³) | 2,70 | [W] §2.2 e Tabela 2 |
| Densidade do betume (g/cm³) | 1,04 | [W] §2.2 (40/50) |
| Corpo de prova virtual | **Rápido: 250 g em Ø65 mm** ou "Como em [W]: 1000 g em Ø102 mm" | a altura sai da densidade (seção 4) |
| Semente | 2024 | |
| Avançado › Bolhas | Automático ([W] Eqs. 3–5), Manual (B, BSc, BSh) ou Desligado | |
| Avançado › Força radial | ligada, intensidade 0–2 (padrão 1) | seção 6.3 |

Validar também:

- a % passante não pode crescer em peneiras menores;
- a maior peneira deve ter 100%;
- tem de haver peneiras acima de 2 mm;
- se 4 × TNM > diâmetro do molde, avisar e sugerir o molde de Ø102 mm. TNM é a peneira imediatamente acima da primeira com menos de 90% passante.

### 3.3 Misturas de [W] como presets de validação

As 14 misturas da [W] Tabela 1 entram no seletor. Cada uma traz pedra (L ou G), teor de betume e AVC medido, e mostra os valores medidos de B, BSc e BSh (Apêndice A). A curva por peneira é uma conversão aproximada:

- cada tipo de agregado da Tabela 1 é uma linha da Tabela 2 (20 mm = L5/G5, 14 mm = L4, 10 mm = L3, 6 mm = L2, 4 mm (pó) = L1);
- a parte "< 2 mm" de cada tipo (coluna da Tabela 2) se distribui log-uniformemente em 0,063–2 mm;
- o restante se distribui log-uniformemente na faixa do tipo, a partir de 2 mm;
- o fíler passa todo em 0,063 mm.

---

## 4. Etapa 1: composição (massa fixa, como em [W])

[W] cria **1000 g** de mistura num tubo de **Ø102 mm**. A altura sai da densidade:

```
Gmm   = 100 / ((100 − Pb)/ρa + Pb/ρb)
Gmb   = Gmm · (1 − AVC/100)
V     = massa / Gmb                         (cm³)
H     = V · 1000 / (π·R²)                    (mm)
m_agg = massa·(1 − Pb/100);   m_bit = massa·Pb/100
p2    = % passante em 2 mm (interpolação em log da abertura)
m_fino = m_agg·p2/100;   m_graúdo = m_agg − m_fino
V_graúdo = m_graúdo/ρa                       (agregados com Min Feret ≥ 2 mm)
M        = m_fino/ρa + m_bit/ρb              (mastique: betume + fíler + finos, [W] §3.2)
V_vazios = V·AVC/100
k1000    = 1000/massa                        (para as [W] Eqs. 3–5)
```

**Frações simuladas:** para cada par de peneiras consecutivas acima de 2 mm, (lo, hi), a % da fração é `p(hi) − p(lo)`.

**Valores esperados para a C-12,5 (meio da faixa), Pb 5,5%, AVC 4%:**

| | 250 g, Ø65 | 1000 g, Ø102 |
|---|---|---|
| Gmm · Gmb | 2,482 · 2,383 | 2,482 · 2,383 |
| H | 31,6 mm | 51,4 mm |
| p2 | 40,1% | 40,1% |
| V_graúdo | 52,4 cm³ | 209,5 cm³ |
| M | 48,3 cm³ | 193,4 cm³ |
| V_vazios | 4,20 cm³ | 16,79 cm³ |

---

## 5. Etapa 2: agregados virtuais ([W] §3.1 e §4.1)

### 5.1 Parâmetros de forma: [W] Tabela 2

WSc e WSh são a escala e a forma da Weibull; Min Feret em mm; AR = Min Feret/Max Feret; h = espessura relativa.

| Código | Faixa (mm) | WSc Min Feret | WSh Min Feret | WSc AR | WSh AR | h | % massa < 2 mm |
|---|---|---|---|---|---|---|---|
| L1 | 0,063–4 | 2,92 | 6,53 | 0,75 | 5,97 | 0,67 | 82,61 |
| L2 | 4–6 | 4,67 | 4,56 | 0,74 | 7,36 | 0,88 | 3,58 |
| L3 | 6–10 | 8,60 | 5,55 | 0,74 | 6,45 | 0,66 | 2,38 |
| L4 | 10–14 | 11,44 | 6,69 | 0,74 | 6,91 | 0,75 | 0,99 |
| L5 | 14–20 | 17,12 | 7,11 | 0,75 | 7,24 | 0,82 | 0,79 |
| G1 | 0,063–4 | 2,77 | 6,23 | 0,75 | 9,61 | 0,87 | 81,88 |
| G2 | 4–6 | 5,10 | 4,20 | 0,71 | 6,25 | 0,78 | 4,01 |
| G3 | 6–10 | 7,10 | 3,68 | 0,70 | 5,79 | 0,76 | 1,46 |
| G4 | 10–14 | 11,36 | 5,91 | 0,74 | 6,72 | 0,82 | 1,42 |
| G5 | 14–20 | 17,36 | 7,39 | 0,75 | 7,18 | 0,77 | 0,78 |

Densidade de 2,70 g/cm³ em todos. O texto de [W] define H como "mediana do Min Feret / mediana da altura", mas todos os valores são < 1; usar como h = espessura/Min Feret.

**Classe de cada fração:** a linha cuja faixa contém `hi` (a primeira com `hi ≤ limite superior`). Exemplos com a C-12,5: 2–2,36 → L1; 2,36–4,8 → L2; 4,8–6,3 e 6,3–9,5 → L3; 9,5–12,7 → L4; 12,7–19,1 → L5. Acima de 20 mm, usar L5/G5.

**Weibull truncada por probabilidade ([W] §4.1):**

```
x = WSc · (−ln(1 − p))^(1/WSh)
Min Feret:  p ~ U(0,005; 0,65)
AR:         p ~ U(0,03; 0,97)
```

Com esses limites, AR fica entre ~0,42 e ~0,90. A consequência conhecida ([W] §5) é que o modelo **não reproduz os maiores agregados** de cada classe. Mostrar isso em "Sobre o método".

### 5.2 Algoritmo de uma forma (escala unitária, Min Feret = 1)

O original de [W] semeia N pontos num prisma, desloca-os por J ∈ [−0,5; 0,5] da distância ao centro de gravidade, suaviza com ruído de Perlin, triangula por Delaunay e acrescenta "mossas" (Sd, Jd). N, J, Sd e Jd foram otimizados por evolução diferencial, e [W] não publica os valores. Por isso o app usa uma aproximação convexa, que também é necessária para o teste de voxel por semiplanos e para o aglomerado de esferas:

1. cuboide `a = 1/AR`, `b = 1`, `c = h·(1 ± 8%)`, com c limitado a [0,42; 0,98];
2. 36 pontos na superfície (face sorteada pela área), empurrados para dentro por 0–28% da meia-dimensão;
3. casca convexa (força bruta em 36 pontos);
4. reescalar para as extensões (a, b, c), centrar no centroide e girar para os eixos principais de inércia (Jacobi 3×3, com det = +1);
5. guardar vértices, faces, planos, volume, momentos principais e um **aglomerado de até 10 esferas** (gulosas, raio = 1,1 × distância inscrita, cobertura de 96%).

São 60 formas por classe usada; cada partícula usa uma forma com escala e rotação próprias, e o desenho usa `InstancedMesh`.

### 5.3 Sorteio das partículas

Para cada fração (lo, hi), com a classe kc:

```
alvo = m_agg · pct/100
repetir:
   s = Min Feret pela Weibull da classe (p ~ U(0,005; 0,65)); se s < 2 mm, sortear de novo
   forma = forma aleatória da classe
   m = vol_unitário · s³ · ρa / 1000
   parar quando somar m afastaria a massa do alvo
```

Não há calibração do tamanho: o NA sai das distribuições do paper.

**Esperado para a C-12,5, calcário, semente 2024:** 578 partículas em 250 g e 2 310 em 1000 g (2–2,36: 869; 2,36–4,8: 1 054; 4,8–6,3: 95; 6,3–9,5: 222; 9,5–12,7: 63; 12,7–19,1: 7). As massas de cada fração fecham com o alvo (±1 partícula).

---

## 6. Etapa 3: mistura e compactação ([W] §3.2–3.3)

### 6.1 Como [W] faz

- Os agregados são gerados num tubo de Ø102 × 500 mm, em posições aleatórias, até completar a massa de cada tipo.
- A simulação é **sem gravidade** (para não segregar por peso) e **sem atrito**, com partículas rígidas. O motor é o PhysX da Unity, por impulsos, com dt = 0,007 s.
- Mistura: uma força de 2 N no centroide de cada agregado durante 0,01 s, a cada 0,5 s.
- Dois pistões aparecem nas pontas do tubo e avançam um contra o outro a velocidade constante até **AVC = 50%** pela Eq. (1):
  ```
  AVC = 100 · (π(D/2)²·H − V_agregados≥2mm − V_agregados<2mm − V_betume) / (π(D/2)²·H)
  ```
- A partir daí, a força nos pistões cresce 0,12 N/s enquanto a velocidade deles for < 0,001 m/s, até o AVC medido em laboratório.
- Uma **força radial** igual para todos os agregados, apontando para o centro entre os pistões, reproduz o efeito "castanha-do-pará" do Marshall: os grãos pequenos, com menos inércia, se juntam no centro. [W] testou 0 / 0,0007 / 0,00095 / 0,002 N (RMSE 2,70 / 1,75 / 1,36 / 0,45) e escolheu **0,002 N**.

### 6.2 Como o app faz (DEM de aglomerados de esferas no Web Worker)

O PhysX não roda no navegador, então o app usa um DEM explícito com a mesma sequência. Os valores de força e tempo de [W] não se transferem diretamente: o tempo é comprimido e as forças são escaladas pela massa da menor partícula.

- Unidades: mm, kg, s (força em mN). Massa `vol·s³·ρa·1e−6`; inércia `I_unit·s⁵·ρa·1e−6`.
- Contato esfera-esfera e esfera-parede: `Fn = kn·δ − cn·vn` (≥ 0), com `kn = 1000 mN/mm` e `cn = 2·0,3·√(m_ef·kn)`; **μ = 0** (sem atrito, como em [W]); torque `(ponto − centro) × F`.
- Paredes: cilindro de raio R, pistão inferior em zb e superior em zp; cada pistão anda metade da velocidade de aproximação.
- Euler semi-implícito, dt = 2e−5 s, quaternions com a equação de Euler no referencial do corpo, amortecimento global `F −= γ·m·v`.
- Vizinhos: grade de células com lista de Verlet (folga de 0,6 mm, reconstrução quando o deslocamento passa de 0,27 mm).
- **Sem gravidade.**
- **Distância de contato de 0,25 mm** somada ao raio de todas as esferas, o equivalente à distância de colisão de [W]. O aglomerado de esferas não cobre os cantos da casca, e sem essa folga os cantos se interpenetram. Nos testes com a C-12,5, a sobreposição foi de 4,3% do volume de agregados sem folga, 2,4% com 0,12 mm e **1,2% com 0,25 mm**.

### 6.3 Sequência

1. **Tubo:** partículas em ordem aleatória numa coluna, sem sobreposição dos raios envolventes, com orientações aleatórias. Os pistões começam 0,5 mm além das partículas extremas.
2. **Mistura e pistões até AVC 50%:** aproximação a 150 mm/s até a altura `gap50 = (V_graúdo + M)/(0,5·π·R²)`, com γ = 4 s⁻¹. Durante essa fase:
   - **mistura:** força igual para todas, `3·m_min·g`, em direção aleatória (sorteada a cada pulso), por 0,005 s a cada 0,1 s;
   - **força radial:** `F_bn = intensidade · 0,3 · m_min · g`, igual para todas, apontando para (0, 0, (zb+zp)/2). Na intensidade 1, a menor partícula recebe 0,3 g e as maiores recebem menos de 0,01 g.
3. **Força crescente até o AVC alvo:** os pistões avançam a 40 mm/s só enquanto a força média neles está abaixo de um limite que cresce com o tempo, `5 N + 100 N/s · t`. Assim a força sobe enquanto o esqueleto resiste, como em [W]. A força radial continua ligada. Se em 1,5 s simulados a altura H não foi atingida, os pistões vão a H assim mesmo, e o painel avisa que o esqueleto travou.
4. **Acomodação:** 0,06 s com os pistões parados, γ = 8 s⁻¹ e sem força radial.
5. Transladar para que a base fique em z = 0.

O progresso mostra a fase, a altura entre os pistões, o AVC pela Eq. (1) e a força nos pistões.

---

## 7. Etapa 4: mastique e bolhas (voxels), [W] §3.5–3.6

[W] separa os vazios em dois tipos: os **vazios do esqueleto**, aonde o mastique não chega, e as **bolhas** de ar presas no mastique. A fração B de bolhas e o tamanho delas vêm das Eqs. (3)–(5) (seção 8.1).

### 7.1 Grade

1. Voxel de **0,25 mm** no corpo de prova rápido e de **0,4 mm** no de 1000 g. [W] usou tomografia a 90,5 µm e pintou fatias com voxels de ~0,25 mm.
2. **Agregado** = voxel cujo centro está dentro da casca transformada de alguma partícula (teste por semiplanos); guardar o índice da partícula (`Int32Array`).
3. Espaço livre = dentro do cilindro e não agregado. Todo ele começa como vazio.
4. **A parede, a base e o topo contam como agregado** na distância ([W] §3.6).

### 7.2 Pintura do mastique

1. Distância de cada voxel livre à borda de agregado mais próxima, incluindo as paredes: chamfer 3D 3-4-5 em duas passadas. [W] fez em 2D com 8 direções por fatia.
2. Desempate: `d' = d + 0,15·ruído de valor 3D (escala de 1 mm)`, em unidades de voxel.
3. Alvo dos vazios do esqueleto: `V_esq = V_vazios·(1 − B/100)`, "o AVC da compactação menos o percentual de bolhas".
4. Ordenar por d' e rotular como **mastique** do mais próximo ao mais distante, até sobrarem `V_esq` de vazio. Implementar com histograma de 4 096 classes.
5. **Redução de ruído:** todo mastique com ≥ 10 de 26 vizinhos vazios vira vazio. É o equivalente 3D da regra de [W], que é 4 de 8 no plano. Depois, devolver ao mastique os vazios de menor d', **excluindo os que acabaram de virar vazio**, até voltar a `V_esq`. No máximo 3 iterações.
6. Grãos de vazio com menos de 30 voxels viram mastique; recompor `V_esq` com o mastique de maior d'.

### 7.3 Bolhas

1. `V_bolhas = V_vazios·B/100`.
2. Diâmetro: `d = 10·BSc·(−ln U)^(1/BSh)` em mm, limitado a [2·voxel; 5 mm]. 5 mm é a maior bolha medida em [W].
3. Um centro é aceito se:
   - a distância ao agregado (ou à parede) for ≥ d/2 + 1 voxel, para a bolha ficar inteira no mastique;
   - a distância aos vazios do esqueleto for ≥ 1 mm ([W] §3.6), calculada uma vez por chamfer;
   - a bolha ficar a pelo menos 1 voxel das outras (grade espacial de 6 mm).
4. Sortear centros entre os voxels de mastique candidatos. Se não couber em 120 tentativas, reduzir d em 20% (até 7 vezes). Parar após 400 bolhas seguidas sem lugar e completar o que faltar com vazios do esqueleto, com aviso.
5. Fases: 0 = fora, 1 = mastique, 2 = vazio do esqueleto, 3 = bolha, 4 = agregado.

> **Por que não a regra literal de [W]** (distância ≥ diâmetro e 1 mm de *qualquer* vazio): num teste com AVC 4,8%, ela só deixou caber 0,84 de 2,9 cm³ de bolhas. Com milhares de bolhas de ~1 mm, a zona de exclusão de 1 mm passaria do volume de mastique. As regras acima mantêm a ideia (bolhas fechadas no mastique, longe dos vazios do esqueleto) e cabem em misturas densas.

### 7.4 Validação, como em [W] §3.3 e §4.5

**Resultado de referência** (C-12,5 no meio da faixa, calcário, Pb 5,5%, AVC 4%, 250 g, semente 2024, teste em Node):

| Grandeza | Resultado | Alvo |
|---|---|---|
| Agregados | 51,7 cm³ (sobreposição 0,61 cm³) | 52,4 cm³ |
| Mastique | 49,5 cm³ | 48,3 cm³ |
| Vazios do esqueleto | 2,19 cm³ | 2,19 cm³ |
| Bolhas | 2,03 cm³ (2 830 bolhas, mediana de 0,67 mm) | 2,02 cm³ |
| AVC | 4,00% | 4,0% |
| B real | 48,0% | 48% |
| Perfil radial | 8,6% junto às paredes, 2,9% no centro | banheira |
| Tempo | ~1,5 min | |

- volumes de agregado, mastique, vazios do esqueleto e bolhas; AVC real; B real; mediana do diâmetro das bolhas; sobreposição entre agregados;
- **AVC por quadrante** da seção a meia altura ([W] Fig. 4);
- **perfil radial de vazios:** 20 faixas ao longo do diâmetro, no terço central da altura, com gráfico. O esperado é a forma de **banheira** ([W] Fig. 16, R² = 0,77 contra a tomografia).

---

## 8. Equações

### 8.1 Bolhas: [W] Eqs. (3), (4) e (5)

NA = número de agregados e M = volume de mastique (cm³), **por 1000 g**; AVC em %:

```
B   = (81,38·NA − 125,2·M − 170 800) / (NA − 23,01·M + 2 106)      R² = 0,88
BSc = (73,22·AVC + 60,94·B − 1 065) / (AVC + 426,7·B + 4 318)     R² = 0,77   (cm)
BSh = (507,9·AVC + 1 189·B − 8 587) / (AVC + 910,6·B − 5 781)     R² = 0,83
```

- **Unidades:** B em %. A [W] Tabela 3 mostra B como fração (0,23 = 23%); as Eqs. (4)–(5) só reproduzem a tabela com B em %.
- **Divergência da Eq. (3):** o denominador zera na reta NA = 23,01·M − 2 106, e as misturas de [W] ficam perto dela (a mistura 7 tem denominador 32). Se B sair de [0; 100] ou se |denominador| < 200, usar **B = 48%** (mediana da Tabela 3) e mostrar o valor que a equação daria. A curva padrão C-12,5 cai nesse caso: NA 2 310 e M 193,4 por 1000 g dão um B "bruto" de ~220%.
- **Divergência das Eqs. (4)–(5):** se BSh sair de [0,8; 4] ou BSc de [0,02; 0,3] cm, usar as medianas **BSc = 0,115 cm e BSh = 1,47**.
- [W] trata as misturas 4, 12 e 13 como *outliers* (critério de 3 MAD).

**Testes obrigatórios** (linhas da [W] Tabela 3):

| Mistura | NA | M | AVC | B medido → Eq. 3 | BSc → Eq. 4 (com B medido) | BSh → Eq. 5 (com B medido) |
|---|---|---|---|---|---|---|
| 1 | 2 707 | 122,02 | 10,94 | 23 → **17,1** | 0,07 → **0,080** | 1,63 → **1,60** |
| 5 | 8 321 | 220,23 | 11,68 | 96 → **89,3** | 0,12 → **0,125** | 1,37 → **1,37** |
| 7 | 2 406 | 194,73 | 3,18 | 20 → **19,8** | 0,04 → **0,030** | 1,37 → **1,35** |

Calculadora no painel: sliders de NA (1 500–9 000) e M (100–260) por 1000 g e de AVC (2–25%), mostrando B, BSc, BSh, o diâmetro médio `10·BSc·Γ(1 + 1/BSh)` e o volume de bolhas por 1000 g.

### 8.2 Extra: propriedades por [A] Eq. (3)

Numa ficha separada, com borda tracejada e o título "Extra · Awuah et al. (2024)". Com M e NA **por 250 g**:

```
φ = (β0 + β1·M + β2·NA) / (1 + β3·M + β4·NA)
```

| | AVC (%) | ω (%) | S (kN) | F (mm) |
|---|---|---|---|---|
| β0 | 4,36E+08 | 1,70E+09 | 6,25 | 2,62E−01 |
| β1 | −2,62E+06 | 1,07E+07 | −1,50E−03 | 3,97E−02 |
| β2 | −2,00E+05 | −9,90E+05 | −1,92E−03 | −5,13E−04 |
| β3 | 5,62E+05 | 5,90E+05 | −9,52E−03 | −1,00E−02 |
| β4 | 2,13E+02 | −6,86E+03 | −2,51E−04 | −2,62E−04 |

- Teste: M = 37,26 e NA = 1 196 dão AVC 4,68, ω 66,4, S 11,3 e F 3,59.
- Limites ([A] Tabela 7), para o verde e o vermelho: ω de 50 a 80%; S > 6,7 kN; F de 2 a 4 mm; AVC de 3 a 5%.
- Aviso obrigatório: a equação foi calibrada para SMA 8 de calcário, betume 40/60 e tamanho máximo de 10 mm (erro médio de ~22% fora disso), e o NA de [A] vem de outra calibração de tamanho. Usar só como referência.
- Calculadora recolhível, com sliders M (25–65) e NA (400–2 500) por 250 g.

---

## 9. Visualização

### 9.1 Cena 3D (three.js r128)

- Coordenadas z-para-cima, dentro de um `Group` com `rotation.x = −π/2`.
- **Agregados:** um `InstancedMesh` por forma; matriz = posição · rotação (quaternion `(x,y,z,w)`) · escala s; `MeshStandardMaterial({flatShading:true, roughness:0.92, side:DoubleSide})`. Duas cores:
  - **Pedra:** 5 tons por partícula. Calcário: rgb(184,178,166), (164,158,147), (199,192,178), (146,141,132), (210,203,190). Granito: (150,148,150), (118,116,120), (176,170,168), (96,94,98), (196,186,180).
  - **Por fração:** amarelo (232,197,71), laranja (214,135,64), azul (91,141,196), azul escuro (64,92,168), magenta (176,72,140), verde (120,170,110), violeta (150,110,200), ciano (90,180,190). A legenda mostra a faixa, a classe da Tabela 2 e o número de partículas.
- **Vazios do esqueleto:** malha por *surface nets* sobre a máscara (subamostrada em ~0,5 mm, suavizada [1,2,1], com no máximo 250 mil triângulos), em vermelho (226,61,40).
- **Bolhas:** esferas instanciadas (icosaedro subdividido 2 vezes), em vermelho ou, com "distinguir bolhas", em salmão (240,128,96).
- **Mastique:** cilindro aberto escuro (#1b1a19) como pele, mais as tampas e o plano de corte texturizados com a imagem da seção (mastique escuro, vazios vermelhos, agregados na cor do modo, `alphaTest 0.5` fora do círculo).
- **Cortes** com `localClippingEnabled` e um `THREE.Plane`: vertical em x = c (mantém x < c) e horizontal em z = c (mantém a parte de baixo); o plano texturizado "tampa" o corte.
- Luzes: hemisférica (0,75), direcional (0,9) e preenchimento (0,3).

### 9.2 Câmera

Arrastar gira; roda aproxima; botão direito ou Shift + arrastar move; dois dedos fazem pinça. Usar pointer events e `touch-action: none`.

### 9.3 Aba "Tomografia"

- Seção horizontal (xy em z) ou vertical (yz em x), com slider, ampliada sem suavização.
- **Estilo TC**, como as figuras 13 e 17 de [W]: vazios brancos, mastique preto e agregados cinza.
- Ficha "Seção atual": AVC da seção, número de agregados cortados, medianas de Min Feret e AR (18 direções por seção) e AVC por quadrante. Isso permite comparar com [W] Fig. 11.

### 9.4 Barra flutuante

Com mastique | Só agregados · Pedra | Por fração · Sem corte | Corte vertical | Corte horizontal · slider "x = 0 mm" · vazios · distinguir bolhas.

### 9.5 Painel lateral (fichas)

1. Legenda.
2. Composição: massa, molde (Ø × H), betume, passante em 2 mm, agregados ≥ 2 mm (g e cm³), NA (e por 1000 g), M (e por 1000 g), vazios, Gmm e Gmb.
3. Vazios e bolhas:
   - B previsto, BSc e BSh, com os avisos de divergência;
   - nos presets de [W], os valores medidos;
   - vazios do esqueleto e bolhas (real × alvo), B real, mediana das bolhas, AVC real, AVC por quadrante e sobreposição;
   - gráfico do perfil radial.
4. Calculadora de bolhas ([W] Eqs. 3–5).
5. Exportar: "Baixar STL (.zip)", "STL ASCII dos agregados" e "STL ASCII dos vazios" (malha + icosferas das bolhas).
6. Sobre o método: referência de [W] e as limitações do Apêndice B.
7. Extra · Awuah et al. (2024).

---

## 10. Fluxo da interface

1. Ao abrir: C-12,5 no meio da faixa, Pb 5,5%, AVC 4%, calcário, 250 g. O app roda sozinho e mostra o progresso. O 3D aparece em ~2–4 min.
2. "Gerar corpo de prova" roda com as entradas atuais. Etapas: Composição → Formas → Mistura e pistões até AVC 50% → Compactação por força até o AVC alvo → Pintura do mastique → Bolhas → Pronto.
3. A composição aparece na hora; NA, B, BSc e BSh aparecem logo após o sorteio, antes da física.
4. Se as entradas mudarem depois de um resultado, avisar que o 3D é do corpo de prova anterior.
5. O corpo de prova de 1000 g leva de 10 a 30 min; avisar ao escolher.

---

## 11. Visual

- Bancada de laboratório: fundo #eeece8, cartões #f8f7f4, texto #1f1e1c, acento âmbar-asfalto #b3611b (no escuro, #e0913f) e faixa granulométrica em azul (#5b8dc4; no escuro, #7fa9d8).
- Escuro: fundo #171615 e cartões #201f1d.
- Fontes: Archivo 800 (títulos), IBM Plex Sans (texto) e IBM Plex Mono (números, `tabular-nums`).
- Título "Corpo de Prova **C-12,5**", com o nome no acento. Abaixo, em mono: norma · faixa · pedra · betume · AVC · massa e molde · Wan et al. (2024).
- Área 3D à esquerda (altura min(72vh, 720 px)) e painel de 360 px à direita; uma coluna em telas estreitas.

---

## 12. Critérios de aceitação

- [ ] A página abre sem erros e nunca fica presa em "carregando".
- [ ] A biblioteca embutida tem as 23 faixas; a padrão é a DNIT 031/2024 C-12,5 com o meio da faixa da seção 3.1, e o gráfico mostra a faixa, a curva e a linha de densidade máxima.
- [ ] A composição da C-12,5 bate com a tabela da seção 4.
- [ ] O sorteio da C-12,5 dá 578 partículas (250 g) e 2 310 (1000 g), com as massas das frações fechando, e todos os AR ficam entre 0,42 e 0,91.
- [ ] As [W] Eqs. (3)–(5) reproduzem os três testes da seção 8.1; a C-12,5 cai no fallback de B = 48%, com aviso.
- [ ] A compactação para no AVC alvo: AVC real a ±0,1 ponto do alvo e sobreposição < 2% do volume de agregados.
- [ ] Bolhas = V_vazios·B/100 com erro < 5%, e nenhuma bolha encosta num agregado.
- [ ] Com a força radial ligada, o perfil de vazios tem forma de banheira: a média das 2 faixas junto a cada parede é maior que a das 6 faixas centrais.
- [ ] O 3D gira, dá zoom, corta nas duas direções e mostra o mastique no corte; a aba Tomografia é coerente com o 3D.
- [ ] Os presets de [W] carregam e mostram os valores medidos de B, BSc e BSh.
- [ ] O `.zip` de STL abre num visualizador comum.
- [ ] A ficha de Awuah dá ω 66,4, S 11,3, F 3,59 e AVC 4,68 para M = 37,26 e NA = 1 196 na calculadora.

---

## Apêndice A. Dados de validação de [W]

14 misturas compactadas com 50 golpes por face (BS EN 12697-30), Ø102 mm, betume 40/50 (1,040 g/cm³) e fíler calcário (2,700 g/cm³). Tabela 1 (composição, % em massa por tipo de agregado) e Tabela 3 (resultados de 1000 g virtuais):

| Nº | Pedra | 20 mm | 14 mm | 10 mm | 6 mm | 4 mm (pó) | Fíler | Betume | AVC | B | Min Feret bolhas (cm) | BSc (cm) | BSh | NA | M (cm³) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | L | 0,0 | 59,4 | 14,5 | 3,2 | 22,9 | 0,0 | 5,0 | 10,94 | 0,23 | 0,15 | 0,07 | 1,63 | 2 707 | 122,02 |
| 2 | L | 18,7 | 18,6 | 13,6 | 9,2 | 33,9 | 6,0 | 4,0 | 10,98 | 0,47 | 0,20 | 0,06 | 1,44 | 3 910 | 167,16 |
| 3 | L | 0,0 | 0,0 | 72,4 | 4,5 | 23,1 | 0,0 | 7,0 | 11,24 | 0,14 | 0,10 | 0,06 | 2,00 | 3 099 | 144,96 |
| 4 | L | 0,0 | 0,0 | 0,0 | 42,9 | 51,1 | 6,0 | 7,0 | 3,96 | 0,36 | 0,10 | 0,04 | 1,43 | 8 100 | 250,01 |
| 5 | L | 0,0 | 0,0 | 0,0 | 49,0 | 51,0 | 0,0 | 6,0 | 11,68 | 0,96 | 0,50 | 0,12 | 1,37 | 8 321 | 220,23 |
| 6 | G | 0,0 | 0,0 | 70,8 | 4,7 | 24,5 | 0,0 | 5,5 | 22,23 | 0,58 | 0,40 | 0,16 | 1,54 | 4 572 | 131,71 |
| 7 | G | 18,7 | 18,5 | 13,3 | 9,5 | 34,0 | 6,0 | 7,0 | 3,18 | 0,20 | 0,10 | 0,04 | 1,37 | 2 406 | 194,73 |
| 8 | G | 0,0 | 0,0 | 0,0 | 47,2 | 52,8 | 0,0 | 5,3 | 20,68 | 0,80 | 0,40 | 0,13 | 1,53 | 8 078 | 218,09 |
| 9 | G | 0,0 | 0,0 | 0,0 | 44,4 | 49,6 | 6,0 | 7,0 | 8,97 | 1,00 | 0,50 | 0,12 | 1,49 | 7 789 | 244,99 |
| 10 | G | 0,0 | 0,0 | 59,4 | 5,4 | 26,2 | 9,0 | 6,5 | 7,64 | 0,89 | 0,40 | 0,12 | 1,32 | 4 397 | 177,13 |
| 11 | G | 0,0 | 0,0 | 51,9 | 14,8 | 25,3 | 8,0 | 7,3 | 11,54 | 0,67 | 0,50 | 0,13 | 1,23 | 4 950 | 179,39 |
| 12 | G | 0,0 | 0,0 | 63,2 | 13,5 | 18,3 | 5,0 | 5,5 | 20,90 | 0,49 | 0,30 | 0,17 | 2,30 | 4 683 | 131,30 |
| 13 | G | 0,0 | 0,0 | 57,6 | 10,1 | 28,3 | 4,0 | 5,7 | 16,49 | 0,04 | 0,10 | 0,05 | 1,65 | 4 683 | 159,22 |
| 14 | G | 0,0 | 64,4 | 0,0 | 4,7 | 26,9 | 4,0 | 5,2 | 10,45 | 0,34 | 0,20 | 0,11 | 1,35 | 2 865 | 149,71 |

As misturas 11–13 têm vazios grandes perto da parede, que o modelo virtual subestima ([W] §4.5).

## Apêndice B. Limitações apontadas por [W] (mostrar em "Sobre o método")

- A Weibull truncada não reproduz os agregados de maior Min Feret de cada classe; Weibull pode não ser a melhor distribuição para agregados peneirados.
- A força radial foi calibrada só com a mistura 1 e 50 golpes Marshall; outra compactação (giratória, rolo) pode pedir outra força.
- A orientação dos agregados difere mais da real quando há pouco mastique (Fig. 14); partículas menores são reproduzidas com mais fidelidade.
- Cerca de 20% da variação de BSc e BSh não se explica por AVC e B (fíler e resolução da tomografia podem influir).
- A pintura do mastique original leva de minutos a mais de 30 min; a versão em voxels com distância chamfer leva segundos no corpo de prova rápido.

## Apêndice C. Próximo passo: agregados medidos

A pasta `Aggregate types` vai fornecer formas reais (ver `fontes.csv`):

- F001–F003: micro-tomografia de testemunhos de SMA 11 S (diabásio), para segmentar;
- F004: malhas STL de partículas escaneadas (Thilakarathna, CC BY 4.0).

Quando os descritores (`02_descritores`) e o modelo (`03_modelo`) estiverem prontos, a biblioteca de formas da seção 5 deve ser trocada por elas, mantendo a mesma interface: vértices, faces, planos, volume, inércia e esferas por forma, mais WSc/WSh de Min Feret e AR por classe.

## Apêndice D. Curvas do usuário e versão desktop (Marshall Simulator)

**Adicionar curva:**
- "+ Adicionar curva" abre uma caixa para colar ou importar a curva (CSV/TXT), com uma peneira por linha.
- Duas colunas (peneira; % passante) dão uma curva; três (peneira; mínimo; máximo) dão uma faixa.
- Aceita `;`, tabulação, espaço ou vírgula como separador, e vírgula ou ponto como decimal; linhas de cabeçalho são ignoradas.
- Se a maior peneira não tiver 100%, o app acrescenta uma peneira 1,5× maior com 100%.
- "Salvar tabela como curva" grava a tabela atual.
- As curvas aparecem no grupo "Minhas curvas" e podem ser excluídas, com confirmação em dois cliques.
- Ficam salvas em `minhas_curvas.json` (desktop) ou no navegador (artefato).

**Versão desktop:** `python marshall_simulator.py`. Com `pip install pywebview`, a mesma página abre numa janela própria chamada "Marshall Simulator". O motor é o mesmo, o STL `.zip` é salvo pelo diálogo do sistema e as curvas vão para o arquivo. Sem o pywebview, o programa serve a pasta em 127.0.0.1 e abre o navegador padrão. Precisa de internet só para carregar o three.js.

## Apêndice E. Idioma e misturas alemãs AC/PA

**Idioma:** botões PT | EN no cabeçalho. O português é o texto-fonte. O inglês é aplicado por um dicionário de trechos, inclusive nos textos gerados durante a simulação. A escolha fica salva no navegador (`md-lang`). Os números continuam com vírgula decimal.

**AC e PA da TL Asphalt-StB 07/13:** 17 faixas (AC 32/22 T S/N, AC 22/16 B S, AC 16 B N, AC 16/11/8 D S, AC 11/8 D N, AC 8/5 D L, PA 16/11/8).
- Os pontos D e 1,4D (status K) seguem a EN 13108.
- As peneiras intermediárias (status R) são valores **aproximados**: a tabela oficial não está no `gradation_points.csv` nem em fonte pública com texto extraível. Conferir na TL Asphalt-StB 07/13 e corrigir no CSV.
- Cada faixa sugere teor de betume e AVC: AC D ≈ 2–3%, AC B ≈ 5%, AC T ≈ 5,5–6%, PA = 24%.
