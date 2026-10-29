# Plano: app unificado de compactação (Marshall + giratório)

Complementa o `plano_melhorias_marshall_digital.md` (problemas P1–P7 e KPIs K1–K32), que continua valendo.
Data: 2026-10-28. Nenhum código foi alterado até aqui.

## 0. Objetivo

Um único app em vez de três (`marshall_digital_app.html`, `marshall_compactacao.html`, `marshall_compaction_en.html`). Na interface, um seletor de **protocolo**:

| Protocolo | O que simula | Saída principal |
|---|---|---|
| [W] pistões | referência de Wan et al. 2024, sem gravidade | CP no AVC alvo (como hoje) |
| **Marshall** | queda no molde, golpes do soquete por face, molde virado | altura e AVC × golpe |
| **Giratório (SGC)** | molde girando inclinado, pressão constante na placa | altura, %Gmm e AVC × giro |
| *Prensa de duplo êmbolo* (**backlog, não implementar por enquanto**) | carga estática nas duas faces (como Albayati 2024) | AVC final × carga |

**Dois modos de AVC**, decididos pelo usuário (os dois ficam disponíveis):

| Modo | Como funciona | Quando usar | Saída extra |
|---|---|---|---|
| **AVC livre** (resultado) | golpes, giros ou carga até o fim do ensaio; o AVC sai da física | prever o AVC de uma mistura; validar o simulador | AVC previsto × laboratório |
| **AVC travado** (imposto) | a compactação roda igual; se no fim a altura não chegou a H, um ajuste final leva até H | gerar o CP virtual com o AVC medido para análises posteriores (TC, bolhas, ensaios) | **esforço de ajuste**: ΔH do ajuste ÷ ΔH total. Se for grande, o CP é marcado como "compactação dominada pelo ajuste" |

No modo travado, o ajuste final usa o mesmo modelo do mastique e o contato poliédrico, sem desligar gravidade nem atrito, para não repetir a "prensagem pura" de hoje.

Os protocolos compartilham as formas, a composição, o DEM, a pintura do mastique e as bolhas, a análise e a visualização 3D/TC.

---

## 1. Itens do usuário e diagnóstico

### Item 1: agregados entrando uns nos outros

Visto na `marshall_compactacao.html`, modo "só agregados".

**Causas no código atual:**
- **Forma de colisão ≠ forma desenhada.** A física usa até 10 esferas inscritas, com 96% de cobertura do interior (`marshall_digital_app.html:459-466`). A tela mostra a casca convexa. Cantos e arestas ficam sem esfera, e há "buracos" entre as esferas de pedras grandes e chatas onde grãos pequenos entram inteiros.
- **Folga fixa.** O `coat` de 0,25 mm não cresce com a partícula.
- **Contato mole.** kn = 1 N/mm para todos, contra forças de 5 a 155 N nas placas.
- **Fechamento forçado** após 1,5 s, e colocação inicial que desiste depois de 200 tentativas (P4).
- **Métrica que esconde.** A sobreposição volumétrica global (K7 ≈ 1,4%) não vê um grão pequeno inteiro dentro de outro.

**Correção:**
1. **Fase fina poliédrica.** As esferas ficam só como broad-phase. O contato passa a ser vértices de A contra os planos de B, e vice-versa: `pl` já existe por forma, e as normais e a profundidade saem dos semiplanos. GJK/EPA fica para depois, se faltar o contato aresta-aresta.
2. **Rigidez por tamanho.** kn ∝ E·r_ef, com dt tirado do passo crítico √(m_min/kn_max).
3. **Sem fechamento forçado.** Se o esqueleto travar, isso vira resultado e aviso, não uma prensagem.
4. **Colocação** que cresce a coluna em vez de desistir.
5. **KPI novo K33:** penetração máxima e P99 por par, pela casca real, ÷ Min Feret da menor. Meta ≤ 2%. As partículas fora da meta ficam destacadas no 3D.

### Item 2: compactação que é "prensagem pura no fim"

- Em `marshall_compactacao.html:270-283` o CP só chega ao AVC alvo por uma **prensagem sem gravidade e sem atrito**.
- **Causa de fundo:** o mastique é uma **película rígida** de espessura `coatM = M/área`. Pedras rígidas com película teriam de ocupar ~96% do volume, o que é impossível.
- **Komaragiri et al. 2021** tiveram o mesmo problema com a película: o volume de vazios saiu maior que o teórico. Eles reduziram a espessura por um fator 0,6, calibrado por tentativa.
- O soquete bate a 0,5 m/s. O real é ~3 m/s (4,536 kg caindo de 457 mm).

**Correção:** um modelo de mastique que ocupa volume, mas flui:
- **Viscoso:** amortecimento linear e angular por par, ∝ η_m·A/h, como em Komaragiri: fluido newtoniano e A = metade da área da partícula menor.
- **Coesivo:** atração normal ∝ σ·A, que trabalha contra a separação.
- **Película reduzida (fator a calibrar).** Mais uma **pressão do mastique** que só aparece quando o volume entre as pedras numa célula se aproxima de M local. É ela que limita a densificação de forma física, em vez de travar por geometria.
- **Gravidade na deposição** e soquete com energia real (ver 3.1).
- **Sem prensagem final.** A altura cai a cada golpe ou giro, e o AVC é resultado. A decisão do usuário sobre AVC como resultado ou imposto está pendente (seção 6).

### Item 3: papers

Ver seção 4.

### Item 4: módulos Marshall e giratório

Ver seção 3.

---

## 2. Arquitetura do app unificado

**Hoje:** a página Marshall lê o HTML do app, aplica patches por busca e troca de texto (`PATCHES`, `replaceBetween`) e quebra a cada mudança no app.

**Proposta:**
- Fontes separadas em `src/`, montadas num HTML único por um script de build. Isso mantém a regra de arquivo único do artefato e o worker por Blob.
- Mesmo uso pela versão desktop (`marshall_simulator.py`) e pelo harness `stress/`, que passa a importar os módulos direto, sem extrair o worker do HTML.

```
src/
  composicao.js     curva, Gmm/Gmb, frações, mastique (já existe, só separar)
  formas.js         biblioteca de formas (trocável por Aggregate types)
  dem/
    nucleo.js       integração, vizinhos, contato poliédrico, modelo do mastique
    paredes.js      plano móvel, cilindro com eixo inclinado/girando, placa por força
  protocolos/
    w_pistoes.js
    marshall.js
    giratorio.js
  pintura.js        mastique, vazios do esqueleto, bolhas (P1a, P2, P3)
  analise.js        perfis radial e vertical, quadrantes, KPIs, curvas de compactação
  ui/               formulário, 3D, TC, animação, exportação, i18n
build.mjs           concatena em marshall_digital_app.html
```

**Desempenho:**
- O SGC de Ø150 mm tem ~4,5–5 kg de mistura e mais de 10 mil partículas ≥ 2 mm.
- **Opção A:** núcleo DEM em C compilado para WASM. O `marshall_digital(1)/dem.c` é ponto de partida, e o mesmo código roda no harness em Node.
- **Opção B:** limitar o giratório no navegador a Ø100 mm, como no DEM da Sensors, e oferecer Ø150 mm só no harness ou no desktop.
- **Recomendo A.** Há também o ganho de reprodutibilidade (P7): WASM dá o mesmo resultado em qualquer máquina.

---

## 3. Protocolos

### 3.1 Marshall (impacto)

| Parâmetro | Valor padrão | Opções |
|---|---|---|
| Norma | DNER-ME 043 / ASTM D6926 | EN 12697-30 |
| Molde | Ø101,6 mm, massa ~1200 g | 250 g / Ø65 (rápido) |
| Soquete | 4,536 kg, queda de 457,2 mm (v ≈ 2,99 m/s) | |
| Golpes por face | 75 | 35 / 50 / 75 |
| Temperatura de compactação | da tabela do betume (seção 3.3) | entrada livre |

**Sequência:**
1. Mistura solta com coesão. Seguir Komaragiri: a deposição por funil foi a que evitou o monte e a pré-compactação.
2. Queda no molde com gravidade; espatulamento opcional (15 em volta e 10 no meio, como na norma).
3. Golpes na face 1 com o soquete livre, de massa e velocidade reais ou escaladas por energia.
4. O molde vira e vêm os golpes na face 2.
5. Acomodação, sem prensagem.

**Saídas:**
- curva h(N) e AVC(N) pela Eq. (1) de [W], com a altura medida;
- energia por golpe;
- AVC final previsto contra o do laboratório.

**Validação:**
- a tendência de Zhu et al. 2022: o deslocamento vertical cresce com o tamanho do agregado e a rotação com o número de golpes (PDF ainda não está na pasta);
- os pares (golpes, AVC) do LTPP (seção 5).

### 3.2 Giratório (SGC)

| Parâmetro | Valor padrão | Opções |
|---|---|---|
| Norma | AASHTO T 312 | EN 12697-31 (conferir o ângulo da norma EN) |
| Molde | Ø150 mm | Ø100 mm |
| Pressão vertical | 600 kPa | 400–800 (Komaragiri testou 400/600/800) |
| Ângulo | 1,25° externo (1,16° interno) | 1,25–2 |
| Velocidade | 30 rpm | |
| Giros | Nini / Ndes / Nmax (ex.: 8 / 100 / 160) | por nível de tráfego |
| Fator de aceleração do giro | 8 (Sensors, Tabela 3) | com amortecimento extra |

**Mecânica:**
- O **molde é que gira inclinado**, com o eixo em precessão, e as placas ficam horizontais.
- A placa de cima é controlada por força.
- Komaragiri giraram a placa em vez do molde. Por isso o efeito da altura do CP saiu invertido em relação ao laboratório, e eles mesmos recomendam girar o molde.

**Saídas:**
- curva %Gmm × N (log N), AVC em Nini, Ndes e Nmax, e o locking point;
- perfil vertical: a Sensors observou a camada de cima mais compactada;
- rotação das partículas.

**Validação:**
- forma da curva da Sensors (Fig. 5): vazios de ~25% caindo para ~4% em ~77 giros, com queda rápida nos primeiros 5–10;
- tendências de Chen 2012 e Komaragiri 2021: mais ângulo e mais pressão compactam mais;
- os pares (Ndes, AVC) do LTPP.

### 3.3 Temperatura e viscosidade (entradas novas)

- **Entrada "grau do betume"**, que define a temperatura de compactação padrão pela EN 12697-35:2025, Tabela 1. A temperatura pode ser editada.

  | Grau | 35/50 | 40/60 | 50/70 | 70/100 | 100/150 | 160/220 |
  |---|---|---|---|---|---|---|
  | T de compactação (°C) | 165 | 155 | 150 | 145 | 140 | 135 |

  A referência equiviscosa é η_b = 0,28 ± 0,03 Pa·s na compactação e 0,17 ± 0,02 Pa·s na mistura.
- **η_b(T):**
  - com dois pontos medidos (por exemplo, viscosidade rotacional a 135 e 165 °C), usar a relação A-VTS, log log η = A + VTS·log T_R;
  - sem medida, ancorar η_b(T_ref) = 0,28 Pa·s com um VTS típico do grau, e avisar que é estimado;
  - o grau PG (EUA, LTPP) entra pela mesma relação.
- **Viscosidade do mastique** a partir do betume: η_m = η_b·(1 − φ/φ_max)^(−2,5·φ_max) (Krieger–Dougherty), com φ = fração de fíler e finos < 2 mm no mastique. O φ_max (~0,6) é um parâmetro de calibração.

---

## 4. Papers da pasta: o que cada um traz

| Paper | Útil para | O que usar |
|---|---|---|
| Wan et al. 2024 ([W]) | base atual | segue como protocolo de referência |
| Ai et al. 2024 (review DEM) | mapa da área | modelos de contato (linear, Burgers, parallel bond); poliedro > esfera no cisalhamento; Eq. 7 da banheira vertical; referências de SGC e Marshall |
| Wang, Wang e Luo 2025 (Sensors) | módulo giratório | 600 kPa, 1,15°, 30 rpm, Ø100 mm; finos < 2,36 mm como bolas de 2 mm; Burgers calibrado pela curva AV × giro (Fig. 5); Tabela 3 abaixo. O Kalman + SmartKli não se aplica sem o sensor |
| Komaragiri et al. 2021 (Bullet, SGC) | **mais próximo do nosso caso** (motor de física + película) | forças viscosas e coesivas por par (Eqs. 13, 19, 25); película reduzida por 0,6; deposição por funil; girar o molde e não a placa; sensibilidade a ângulo, pressão e altura; 4–5 h por simulação num i7 |
| Chen et al. 2012 (YADE, SGC) | módulo giratório | Burgers entre bolas (Kk = Km = 1,2·10⁸ N/m, Ck = 3·10⁸ N·s/m); queda sob gravidade antes de girar; quanto menor o grão mínimo simulado, melhor; efeito do ângulo validado contra Butcher (1998) |
| Li et al. (EDEM, bonding) | futuro: ensaios mecânicos | Hertz-Mindlin com bonding calibrado por tração indireta e superfície de resposta. Não serve à compactação; pode servir a um módulo de estabilidade e fluência ou de compressão diametral |

**Sensors, Tabela 3** (lida da página renderizada):

| Parâmetro | Valor |
|---|---|
| Faixa de tamanho das bolas | 2,36–19 mm |
| Kkn, Kks | 6,4·10³ e 2,1·10³ N/m |
| Ckn, Cks | 88 |
| Kmn, Kms | 54 |
| Cmn, Cms | 35 |
| Atrito | 21 |
| Razão de amortecimento | 14 |
| Mastique simulado | 10% |
| Fator de aceleração do giro | 8 |

As unidades na tabela original são inconsistentes (C em "N/m"; atrito 21). Usar como ordem de grandeza, não como valor de entrada.

**Observações:**
- Os dois arquivos do Chen 2012 diferem só nos bytes finais (carimbo de download). Pode apagar o `-1`.
- **Zhu et al. 2022** (CBM 328:127004, DEM do Marshall) ainda não está na pasta.

---

## 5. Dados do LTPP (`papers/Bucket_147432.xlsx`)

Tabela `AC_LAB_MIX_EXP`: 2 865 linhas, com uma linha por seção e camada (`STATE_CODE` + `SHRP_ID` + `LAYER_NO`).

| Campo | Registros com valor | Faixa (mediana) |
|---|---|---|
| NO_BLOWS (Marshall) | 1 404 | 20–79 (75; 829 com 75 e 538 com 50) |
| SUPERPAVE_N_DES | 156 | 50–174 (96) |
| PERCENT_AIR_VOIDS | 1 183 | 1–23,7 (4,1) |
| **golpes + AVC** | **488** | |
| **Ndes + AVC** | **154** | |
| MAX / BULK_SPECIFIC_GRAVITY | 1 160 / 1 090 | Gmm 2,47 · Gmb 2,37 |
| ASPHALT_CONTENT | 1 259 | 5,2% |
| MARSHALL_STABILITY / FLOW | 1 579 / 1 277 | útil para a ficha de Awuah |
| COMPACTION_TEMP | 47 | 239–325 °F (275) |
| PG / grau do betume | 274 / 159 | |
| GYRATION_RATIO | 0 | vazio |

**Limitações:**
1. **Só o ponto final, sem curva.** Não há altura × giro nem × golpe. As curvas vêm da literatura (Sensors Fig. 5, Komaragiri Fig. 13, digitalizadas) ou do laboratório.
2. **São valores de projeto.** O AVC sai ~4% porque o teor ótimo foi escolhido para isso, então o ponto discrimina pouco. Serve para checar se o simulador, com a mistura e os golpes do projeto, chega perto de 4%.
3. **Falta a granulometria** e a densidade dos agregados dessas camadas. Sem isso não dá para rodar os casos. Baixar do InfoPave a tabela de granulometria do agregado da camada asfáltica, a de densidades do agregado e a do betume, com as mesmas chaves (STATE_CODE, SHRP_ID, LAYER_NO).

### 5.1 Albayati 2024 (`papers/main.pdf` + `Uniaxial Repeated Load Test Data of Asphalt concrete/appendix a.docx`)

Data in Brief 53, 110224 (CC BY). É um caso completo, que dá para rodar direto.

**Material:**

| Item | Valor |
|---|---|
| Agregado | quartzo britado; Gsb 2,631 (graúdo) / 2,661 (miúdo); fíler calcário com G 2,787 |
| Granulometria (Fig. 1, lida do gráfico) | 19 mm: 100 · 12,5: 95 · 9,5: 83 · 4,75: 54 · 2,36: 36 · 0,3: 13 · 0,075: 7 % |
| Betumes | 40/50 (G 1,042) e 60/70 (G 1,027) |
| Teores | 4,0 · 4,6 (ótimo) · 5,2 % |

**Dado A, Marshall 75 golpes (Fig. 2, lido do gráfico, ±0,2 pp):**

| Teor | 4,0 | 4,5 | 5,0 | 5,5 |
|---|---|---|---|---|
| AVC 40/50 | ~6,0 | ~4,6 | ~3,6 | ~2,4 |
| AVC 60/70 | ~6,1 | ~4,8 | ~3,3 | ~2,7 |

No ótimo de 4,6%, a Tabela 4 dá AVC 4,20 / 4,35 e VMA 15,46 / 16,00. Mostra a curva AVC × teor de betume com golpes fixos. É o melhor teste do modo AVC livre do Marshall.

**Dado B, duplo êmbolo** (fica guardado para quando o protocolo sair do backlog):
- 108 CPs de Ø101,6 × 203,2 mm, 3 800 g de agregado.
- 289 kN (65 000 lb) por 1 min em cada face, a 140 °C, com funil e espatulamento (15 + 10) em duas camadas.

| Teor | AVC medido (faixa dos CPs) |
|---|---|
| 4,0 | 5,96–6,77 % |
| 4,6 | 3,91–4,57 % |
| 5,2 | 2,54–3,47 % |

Também traz VMA, VFA, deformação permanente × ciclos e a temperatura. Enquanto o protocolo de duplo êmbolo estiver no backlog, este dado só é usado como **dispersão real entre CPs** (~0,8 pp), a referência para a dispersão entre sementes do simulador.

**Diferença de temperatura:** a compactação foi a 140 °C. Pela EN 12697-35, o 40/50 iria a ~160 °C e o 60/70 a ~150 °C. Usar 140 °C na entrada.

---

## 6. Fases de implementação (proposta)

| Fase | Conteúdo | Critério de pronto |
|---|---|---|
| F0 | Unificar: `src/` + build num HTML único; harness importa os módulos; protocolo [W] idêntico ao atual | golden do spec §7.4 bit-idêntico |
| F1 | Contato poliédrico, kn por tamanho, colocação sem desistência, sem fechamento forçado (item 1, P4, P5) | K33 ≤ 2%; K7 ≤ 2%; K8 ≤ 0,10 |
| F2 | Modelo do mastique (viscoso + coesivo + pressão de volume) e entradas de betume e temperatura (3.3) | densificação monotônica com retornos decrescentes num caso de teste |
| F3 | Protocolo Marshall com gravidade, soquete real e sem prensagem final (item 2) | curva h(N); AVC final dentro de ±1 pp do LTPP nos casos com granulometria |
| F4 | Pintura: P1a (faces), P2 (mastique em misturas graúdas), P3 (bolhas); perfil vertical K31 | K27–K30 do plano de KPIs |
| F5 | Protocolo giratório com molde em precessão e placa por força | curva %Gmm × N com a forma da Sensors Fig. 5; tendências de ângulo e pressão |
| F6 | Calibração: ajuste automático de η_m / φ_max / fator de película por mistura | erro de AVC ≤ 0,5 pp nos casos de calibração |
| F7 | Núcleo em WASM (opção A da seção 2) | Ø150 mm em tempo aceitável; K32 de reprodutibilidade |

F1 e F4 não dependem uma da outra. F2 → F3 → F5 é a sequência principal.

---

## 7. Pendências

1. ~~AVC resultado ou imposto~~ → decidido: os dois modos (seção 0).
2. **LTPP:** granulometria e densidades dos agregados das mesmas camadas (seção 5).
3. **Curvas de laboratório reais** (altura × giro do SGC). O LTPP não tem. Uma ou duas do laboratório já servem para calibrar F6.
4. **Zhu et al. 2022** (DEM do Marshall).
5. **Betume:** para o modo com medida, a viscosidade rotacional em duas temperaturas (opcional).
6. **WASM (opção A) ou limitar o navegador a Ø100 mm (opção B)** para o giratório.

---

## 8. Processo de avaliação: como saber se um KPI está bom

Duas perguntas diferentes:
- **(a)** O simulador está bom? O KPI mede isso.
- **(b)** O KPI está bom? Ele mede o que diz medir.

A triagem mostrou que (b) falha com frequência: 87% dos casos quebraram, K13 nunca disparou e K16 explodiu com terços sem vazio. Por isso há uma etapa só para validar os KPIs.

### 8.1 Três camadas de KPI

| Camada | Pergunta | Exemplos | Referência da meta |
|---|---|---|---|
| **Verificação** | o código faz o que diz? | K1, K2, K4 (fechamentos de volume e massa), K12, K13 (energia), K26 (determinismo), K32 (plataformas) | exata ou tolerância numérica |
| **Plausibilidade física** | o CP é fisicamente possível? | K7, K8, **K33** (sobreposição e penetração), K9 (fora do molde), K16b, K27–K30 (perfis), K19 (bolhas), esforço de ajuste do modo travado | física e literatura; "a calibrar" enquanto faltar medida |
| **Validação** | bate com o laboratório? | V1–V7 abaixo | dados medidos |

### 8.2 KPIs de validação (novos)

| KPI | Comparação | Dado | Meta pass | Meta warn |
|---|---|---|---|---|
| V1 | AVC Marshall 75 golpes × teor de betume (4 teores × 2 betumes) | Albayati Fig. 2 | MAE ≤ 0,5 pp e mesma inclinação (sinal e ±30%) | MAE ≤ 1,0 pp |
| V2 *(backlog, com o protocolo de duplo êmbolo)* | AVC duplo êmbolo × teor (3 teores × 2 betumes) | Albayati, 108 CPs | média dentro da faixa dos CPs; dispersão entre sementes ≤ 2× a dos CPs | média a ±0,5 pp da faixa |
| V2b | dispersão do AVC entre sementes (Marshall, ponto ótimo) | Albayati, dispersão entre CPs (~0,8 pp) | ≤ 2× a dispersão dos CPs | ≤ 3× |
| V3 | AVC no ponto de projeto (golpes ou Ndes) | LTPP (quando houver granulometria) | \|erro\| ≤ 1 pp em ≥ 70% dos casos | ≤ 1,5 pp |
| V4 | forma da curva AVC × giro (normalizada) | Sensors Fig. 5 (digitalizada) | RMSE normalizado ≤ 10% | ≤ 20% |
| V5 | tendências: + ângulo, + pressão, + golpes → menos AVC | Chen 2012, Komaragiri 2021 | sinal correto nos 3 | 2 de 3 |
| V6 | banheira vertical (vazios nas faces > miolo) | Ai et al. Eq. 7; tomografias | K27 ≥ 1,0 | ≥ 0,7 |
| V7 | testes das Eqs. 3–5 de [W] e da ficha de Awuah | spec §8 | exato (já existe) | |

V1, V2 e V2b só fazem sentido no **modo AVC livre**. No modo travado, a validação é o esforço de ajuste: ≤ 10% para pass e ≤ 25% para warn.

### 8.3 Como avaliar um KPI antes de confiar nele (meta-avaliação)

Para cada KPI, antes de entrar no relatório:

1. **Sensibilidade (teste de mutação).** Introduzir de propósito o defeito que o KPI deve pegar e conferir que ele quebra. Exemplos:
   - voltar à colisão só por esferas → K33 tem de quebrar;
   - tratar as faces como agregado na pintura → K27 e K28 têm de quebrar;
   - desligar a gravidade no Marshall → K29 e K16b têm de piorar.
2. **Especificidade.** Sem o defeito, o KPI passa no caso golden e no ponto central. Um KPI que quebra em quase tudo (o K16 de hoje) ou em nada (K13, K11b) não discrimina: recalibrar ou rebaixar para "guarda de regressão".
3. **Estabilidade.** Rodar 5 sementes no ponto central e calcular o coeficiente de variação (CV) do KPI.
   - CV > 0,3: o KPI está medindo ruído amostral (como o K15 com poucos voxels). Exigir um N mínimo ou usar uma janela maior.
   - A meta é comparada com a **mediana** entre sementes, e o **pior** caso é reportado à parte.
4. **Boa definição.** Nada de razão com denominador que pode ir a zero (M1). Preferir diferenças normalizadas pelo alvo, como em K16b.
5. **Rastreabilidade da meta.** Cada meta diz de onde veio (norma, paper, dado medido ou "a calibrar"). Uma meta "a calibrar" não reprova uma fase: só gera aviso.

### 8.4 Rotina por mudança de código

| Etapa | O que roda | Tempo | Critério |
|---|---|---|---|
| 1. Golden | C-12,5, semente 2024, protocolo [W] | ~1,5 min | idêntico à referência (ou diferença justificada e nova referência gravada) |
| 2. Smoke | `stress/grids/smoke.json` | minutos | nenhum crash; verificação 100% pass |
| 3. Validação rápida | V1 com 250 g | ~10 min | sem regressão em relação à versão anterior |
| 4. Triagem | `screening.json` (99 casos) | ~70 min | efeitos por KPI contínuo (`effects.mjs`), comparados com o baseline |
| 5. Validação completa | V1–V7, 3–5 sementes | horas (servidor) | metas da 8.2 |

As etapas 1–3 rodam a cada mudança e as 4–5 ao fechar cada fase da seção 6. O relatório de cada rodada mostra, por KPI, valor, meta, status, delta contra o baseline e se a meta é medida ou "a calibrar".

### 8.5 Portão de cada fase

Uma fase está pronta quando:
- os KPIs que ela promete melhorar atingem a meta pass;
- nenhum outro KPI piora de categoria (pass → warn, ou warn → quebra);
- os testes de mutação dos KPIs novos passam.

---

## 9. Estado da implementação (2026-10-28)

O código antigo está em `legacy_2026-10-28/`. As fontes ficam em `src/` e o app é montado com `node build.mjs` (ver `src/README.md`).

| Fase | Estado | Evidência |
|---|---|---|
| F0 unificar | feito | `src/` + `build.mjs`; antes das mudanças o HTML remontado era idêntico byte a byte ao original. `marshall_compactacao.html` e a versão EN viraram redirecionamentos para o app |
| F1 contato pela casca | feito | golden [W]: sobreposição 0,61 → 0,006 cm³; K33 = 0. No Marshall e no giratório, K33 ≤ 1% do Min Feret, sem pares acima de 2% |
| F2 mastique e betume | feito, calibração preliminar | película 2·λ·M/área, mola mole, lubrificação viscosa η(T) (A-VTS + Krieger–Dougherty), coesão, piso de incompressibilidade (AVC ≥ 0,5%); grau do betume e temperatura no formulário |
| F3 Marshall | feito | queda com gravidade, 75 golpes por face com o molde virado, modos travado e livre, curva AVC × golpe, animação |
| F4 pintura | parcial | P1a (peso das faces, `faceW`) e perfil vertical K31 feitos: golden K27 = 2,6. P2 e P3 não mexidos |
| F5 giratório | feito, calibração preliminar | placa por força (servo), molde inclinado em precessão, viscosidade dividida pela compressão de tempo do giro. C-12,5, 250 g: AVC 5,4% em 100 giros |
| F6 calibração | em andamento | ver 9.1 |
| F7 WASM | não iniciado | |

### 9.1 Calibração e V1 (Albayati 2024, betume 60/70, Marshall 75 golpes, AVC livre)

Padrões atuais: λ = 0,3, escala de energia 0,005, escala de pressão 0,001.

| Teor | AVC previsto (Ø65 mm) | AVC lab |
|---|---|---|
| 4,0% | 12,9% | 6,1% |
| 4,5% | 9,1% | 4,8% |
| 5,0% | 5,6% | 3,3% |
| 5,5% | 3,3% | 2,7% |

- **V1: quebra.** Erro médio de 3,5 pp; a inclinação AVC × teor é −6,6 pp/% contra −2,3 no laboratório. A direção está certa, a sensibilidade ao teor está ~3× alta.
- **No teor de 4,5%:** λ = 0,25 deu 8,7% e λ = 0,2 deu 10,1%. Afinar a película abaixo de 0,3 não ajuda, porque o esqueleto trava.
- **Hipótese principal:** efeito de parede. As rodadas usaram o molde rápido de Ø65 mm, e o Albayati usou Ø101,6 mm, com pedras de até 19 mm. Uma rodada no tamanho Marshall normal (1200 g em Ø101,6) está em andamento.
- **Próximos passos:**
  1. V1 completo no tamanho normal, no servidor, com 3 sementes;
  2. calibrar juntos λ, a rigidez da película (kf) e o atrito μ;
  3. ver por que a sensibilidade ao teor é alta. Suspeita: a película cresce linearmente com M, enquanto parte do mastique fica nos vazios.

### 9.2 Tempo de execução (Node, CPU compartilhada com outras rodadas)

| Caso (250 g) | Tempo |
|---|---|
| [W] | ~2 min |
| Marshall 75 + 75 golpes | ~15 min |
| Giratório 100 giros (15 simulados) | ~6 min |

No navegador, um Marshall com os parâmetros antigos levou 53 min com a CPU dividida.
