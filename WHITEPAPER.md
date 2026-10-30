# Marshall Simulator: corpos de prova asfálticos virtuais por DEM

**Autor:** Sergio Callai · © 2026 · documento vivo, atualizado a cada mudança do projeto (ver o histórico no fim).

## Resumo

O Marshall Simulator gera corpos de prova (CPs) virtuais de misturas asfálticas em 3D a partir da composição: curva granulométrica, teor e grau de betume, temperatura e protocolo de compactação. Ele segue o método de Wan et al. (2024) [W], com agregados ≥ 2 mm como corpos rígidos, mastique pintado em voxels e bolhas de ar semeadas no mastique, e acrescenta dois protocolos de laboratório: o **Marshall** (75 golpes por face) e o **giratório** (SGC). A física roda em JavaScript, no navegador, e num núcleo em C com OpenMP, no servidor, com o mesmo resultado. Um harness de estresse com KPIs (K1–K33, V1–V7) verifica cada versão, e o AVC previsto é calibrado contra dados de laboratório (Albayati 2024).

## 1. Problema

Ensaiar misturas no laboratório é caro e lento, e a tomografia de CPs reais é mais ainda. Um CP virtual realista permite:
- estudar o arranjo do esqueleto e a distribuição de vazios antes de moldar;
- comparar granulometrias, teores de betume e protocolos;
- alimentar modelos mecânicos (FEM/DEM) com uma geometria plausível.

O desafio é a plausibilidade: o CP virtual precisa fechar volume e massa, não ter pedras interpenetradas e reproduzir o AVC e os perfis de vazios dos CPs reais.

## 2. Arquitetura

| Parte | O quê |
|---|---|
| `marshall_digital_app.html` | App único (PT/EN), gerado por `node build.mjs` a partir de `src/`. Roda offline, exceto o three.js (CDN) |
| `src/worker/` | Física e geometria: formas, DEM, protocolos, voxels, pipeline |
| `src/ui/` | Formulário, painel, cena 3D, animação, exportação STL |
| `native/mdsim.c` | Núcleo DEM em C com OpenMP (`mdsim in.bin out.bin [núcleos]`) |
| `stress/` | Harness: extrai o worker, roda casos em Node, calcula KPIs, grades, golden e validação |
| `pacote/` | Pacote Python (pywebview) para colegas: `marshall-simulator` |
| `Aggregate types/` | Pipeline de formas reais (tomografia F001 + STL F004 → biblioteca de formas) |
| `Granulometrric curves/` | Biblioteca de faixas granulométricas (DNIT, AASHTO, TL Asphalt-StB) |

## 3. Método

### 3.1 Composição
- A curva granulométrica é separada em 2 mm: acima, agregados simulados; abaixo, finos que entram no mastique com o fíler e o betume.
- Massa, volume e altura do CP saem das densidades e do AVC alvo ([W] §2).
- As partículas de cada fração são sorteadas até a massa da fração. Um candidato grande demais não encerra a fração: sorteia-se outro, e no fim entra o que deixa a massa mais perto do alvo. Assim a massa sorteada fecha dentro de ~0,5 %, mesmo com pedras de 25 mm num CP de 250 g.

### 3.2 Formas dos agregados
- **[W] Tabela 2:** Min Feret e razão de aspecto (AR) por Weibull truncada, espessura relativa h, por classe; bibliotecas calcário (L1–L5) e granito (G1–G5).
- **Formas reais:** cascas de partículas segmentadas da tomografia SMA 11 S (F001, diabásio) e de STL escaneados (F004), escaladas para I = 1 (eixos x = L, y = I, z = S) e reduzidas até o volume real da pedra. No app: "Diabásio SMA, tomografia F001" e "Todas: F001 + STL F004".

### 3.3 Contato e película de mastique (DEM)
- A forma de colisão é a própria casca convexa: pontos de prova (vértices e meios de arestas) testados contra os semiplanos da outra casca, nos dois sentidos.
- A mola de pedra cresce com o tamanho do contato, como num contato de Hertz linearizado: kn × max(1, sa·sb/(sa+sb)), com sa e sb os Min Feret (parede: sb → ∞). A força deixa de crescer só a 0,125 × Min Feret da menor pedra, uma trava contra normais trocadas. Antes, com kn e trava fixos (0,25 mm), as pedras grandes afundavam umas nas outras sob o golpe do soquete.
- Película de mastique de espessura 2·λ·M / área total das cascas, com mola mole (kf = 0,05·kn), lubrificação viscosa F = η·A·v/h e coesão. A viscosidade η vem do betume na temperatura (A-VTS), corrigida pelo fíler e pelos finos (Krieger–Dougherty), como em Komaragiri et al. (2021).
- As pedras do DEM são ~1000× mais moles que as reais; por isso a energia do soquete e a pressão do giratório entram escaladas. Essas escalas são os parâmetros calibrados.

### 3.4 Protocolos
| Protocolo | Como compacta | Norma |
|---|---|---|
| [W] | Sem gravidade e sem atrito; pistões até AVC 50 % (Eq. 1), depois força crescente até o AVC alvo | Wan et al. (2024) |
| Marshall | Queda com gravidade; 75 golpes do soquete por face, com o molde virado; 1200 g em Ø101,6 mm | DNER-ME 043, ASTM D6926 |
| Giratório | Queda; pressão constante e molde inclinado em precessão; 4700 g em Ø150 mm | AASHTO T 312 |

Moldes por protocolo: o corpo de prova segue a compactação escolhida. O Marshall usa o CP Marshall (1200 g em Ø101,6 mm) e o giratório usa o CP do giratório (4700 g em Ø150 mm); o [W] usa 1000 g em Ø102 mm, como no paper, ou o CP rápido de 250 g em Ø65 mm.

**Esqueleto que não cabe no [W] (A10):** o [W] leva os pistões até a altura do AVC alvo. Em granulometrias abertas ou com AVC alvo baixo, o esqueleto de pedras não cabe nessa altura, e antes o pistão empurrava as pedras umas para dentro das outras (até 1,4 mm de penetração, K8). Agora o pistão para quando uma pedra entra mais de 0,1 mm em outra e espera 0,1 s; se a penetração não cai, o CP fica na altura em que o esqueleto travou, com o AVC medido, e o app avisa (PT/EN). É uma diferença de [W]: o paper sempre chega ao AVC alvo. Nos casos que chegam ao alvo nada muda (golden idêntico bit a bit).

Cada protocolo roda em dois modos: **AVC travado** (um ajuste final leva o CP à altura do AVC alvo, e o app mostra quanto da compactação veio desse ajuste) e **AVC livre** (a altura final define o AVC previsto).

### 3.5 Mastique e bolhas
- O mastique é pintado em voxels a partir das bordas dos agregados e das paredes ([W] §3.6). Os vazios ficam nos voxels mais distantes.
- **Diferença de [W]:** as faces dos pistões pesam menos na distância (`faceW`), para deixar vazios junto às faces, como mostram as tomografias de CPs reais (banheira vertical).
- A fração de bolhas B e o seu tamanho seguem [W] Eqs. (3)–(5); o restante dos vazios é vazio de esqueleto.
- **Bolhas inteiras no mastique (A8):** uma bolha só é semeada se nenhum voxel dela, nem da casca de um voxel em volta, for agregado, parede ou vazio do esqueleto. Antes, a distância chanfrada do centro era só aproximada e ~0,2 % dos voxels de bolha encostavam na pedra (K19); agora é zero por construção. Se as bolhas não cabem (AVC alto, B alto), o que falta vira vazio do esqueleto, o AVC não muda e o app diz qual B ficou (PT/EN).

### 3.6 Saídas
Modelo 3D com cortes, composição, AVC por quadrante, perfis radial e vertical de vazios, curva AVC × golpe ou giro, animação da compactação, STL de agregados, mastique e vazios, e a ficha de propriedades de Awuah et al. (2024).

## 4. Verificação e validação

- **KPIs de verificação** (o código faz o que diz): fechamentos de volume e massa (K1–K4), energia (K12, K13), determinismo (K26).
- **Plausibilidade física:** sobreposição e penetração (K7, K8, K33), contenção (K9), perfis (K14–K16b, K27–K30), bolhas (K19).
- **Validação:** V1 (AVC Marshall × teor, Albayati), V3 (LTPP), V4–V5 (giratório), V6 (banheira vertical).
- **Perfil fino junto às faces:** o worker guarda o AVC por camada de voxel (0,25 mm) nos 4 mm de cada face (`st.vface`). Dele saem K28 (espessura da camada sem vazio) e K30 (assimetria topo/base).
- **Banheira radial × força radial (A11):** o K14 (vazios nas 4 faixas da borda ÷ miolo, no terço central da altura) cresce com a intensidade k: 2,0 → 3,0 → 4,2 → 3,9 para k = 0,5 / 1 / 1,5 / 2 no CP de 250 g (3 sementes). No CP de 250 g o desvio entre sementes chega a 2,4, porque as faixas da borda (cordas do círculo) têm poucos voxels e poucas pedras; em 1000 g, o tamanho em que [W] calibrou a força, k = 1 dá 2,62 / 2,79 e k = 2 dá 3,70 / 2,92. O padrão continua k = 1, e o app avisa junto do campo.
- **Golden:** o caso C-12,5 do [W] com semente 2024 é a âncora de regressão (`node stress/golden.mjs --determinism`). Além das tolerâncias válidas em qualquer máquina, `stress/golden_ref.json` guarda os valores exatos por plataforma (Node + SO), que precisam se repetir bit a bit; o K32 mede a diferença entre plataformas.
- **Rastreabilidade:** cada linha de resultado do harness grava a versão do Node, o SO, a máquina e o hash do app (`env`).
- **Triagem (2026-10-28):** 99 casos, fatorial 2^(9-4) com ponto central × 3 sementes; nenhum crash, hang ou OOM. As quebras e as melhorias decorrentes estão em [`melhorias/BACKLOG.md`](melhorias/BACKLOG.md).

## 5. Resultados de calibração

Marshall em tamanho real (1200 g, Ø101,6 mm), Albayati 60/70 a 140 °C, formas reais, AVC livre, uma semente:

| λ | Escala de energia | AVC (Pb 4 / 4,5 / 5 / 5,5 %) | Erro médio |
|---|---|---|---|
| laboratório | | 6,1 / 4,8 / 3,3 / 2,7 | |
| 0,3 (padrão antigo) | 0,005 | 0,9 / 0,2 / 0,8 / 0,1 | 3,7 pp |
| **0,5** | **0,002** | **8,2 / 4,1 / 4,0 / 2,7** | **0,9 pp** |

O melhor candidato era λ 0,5 com escala 0,002, mas com uma semente só e penetração entre pedras (K33) de 6–8 %, acima do limite de 2 %. A correção do contato (A4) levou o K33 a ~0,3 % e baixou o AVC previsto em 2–3 pp, e a calibração foi refeita.

**Calibração A5 (2026-10-30)**, depois de A4 e A7: λ 0,45–0,6 × escala 0,001/0,002 × 3 sementes × 4 teores = 96 rodadas no servidor (núcleo C, 8 × 4 núcleos), `stress/results/vid1/calib_albayati_m2.jsonl`. Médias das 3 sementes:

| λ | Escala de energia | AVC (Pb 4 / 4,5 / 5 / 5,5 %) | Erro médio | Inclinação vs. lab | K33 máx. |
|---|---|---|---|---|---|
| laboratório | | 6,1 / 4,8 / 3,3 / 2,7 | | | |
| **0,55** | **0,002** | **6,65 / 4,93 / 3,45 / 2,29** | **0,31 pp** | **128 %** | **0,5 %** |
| 0,5 | 0,001 | 6,45 / 3,75 / 2,23 / 1,51 | 0,92 pp | 145 % | 0,4 % |
| 0,5 | 0,002 | 5,00 / 2,44 / 1,32 / 1,28 | 1,72 pp | 109 % | 0,4 % |
| 0,55 | 0,001 | 7,82 / 7,21 / 5,76 / 4,17 | 2,01 pp | 107 % | 0,5 % |
| 0,6 | 0,002 | 8,79 / 7,02 / 5,91 / 4,43 | 2,31 pp | 128 % | 0,7 % |

λ 0,55 com escala 0,002 cumpre as metas (erro ≤ 0,5 pp, inclinação dentro de ±30 %, K33 ≤ 2 %). O desvio entre sementes é de 0,5–0,8 pp por teor, maior que o erro médio: um CP isolado pode errar ~1 pp; a média de 3 CPs, como no laboratório, ~0,4 pp. A calibração vale para Albayati 60/70 a 140 °C; outros ligantes e granulometrias ainda não foram verificados.

**Padrões do app (A6, 2026-10-30):** λ 0,55 e escala de energia 0,002 (antes 0,3 e 0,005). O λ também vale para o giratório, cuja escala de pressão (0,001) ainda não foi recalibrada com o λ novo. Conferência: um Marshall de 1200 g só com os padrões (Pb 5, semente 2024, PC Windows, núcleo C com 16 threads) recebeu os mesmos parâmetros da A5 (película 0,999 mm, v0 134 mm/s) e deu AVC 4,54 %, contra 3,03 % no servidor. A diferença começa já na altura solta (107,07 × 107,77 mm): a ordem das somas entre threads e plataformas muda a trajetória como uma troca de semente. Compare sempre médias de várias sementes.

Núcleo em C × JS: o golden bate (Vagg 52,30 × 52,32); 1,55× mais rápido com 1 núcleo, 3× com 8 e 5× com 24.

## 6. Limitações conhecidas

- As formas da Weibull truncada não reproduzem os maiores grãos de cada classe ([W] §5); as formas reais ainda são convexas (cascas).
- A Eq. (3) de Awuah usa só M e NA: as propriedades previstas não veem a forma das pedras.
- Peneiras intermediárias das faixas alemãs AC/PA aproximadas (conferir na TL Asphalt-StB 07/13).
- Com AVC acima de ~12 % ou B = 100 %, as bolhas inteiras cabem só em parte do mastique (B real 15–45 % nos casos testados). O app avisa; ainda não há estimativa antes de rodar.
- O giratório usa o λ calibrado no Marshall; a escala de pressão ainda não foi calibrada contra laboratório com ele.
- Pequenas diferenças entre plataformas (Node 22 × 24, Windows × Linux): compare sempre na mesma máquina e com Node 24.11.1.

## 7. Referências

**Artigos**
- [W] Wan, L. et al. (2024). Algorithms to create realistic virtual asphalt mixtures. *Computers and Structures* 298, 107391. doi:10.1016/j.compstruc.2024.107391
- [A] Awuah, F.K.A.; Garcia-Hernández, A.; Valentin, J. (2024). A digital design method for asphalt mixtures that incorporates aggregate geometry. *Construction and Building Materials* 416, 135281.
- Komaragiri, S.; Gigliotti, A.; Bhasin, A. (2021). Feasibility of using a physics engine to virtually compact asphalt mixtures in a gyratory compactor. *Construction and Building Materials* 308, 124977. doi:10.1016/j.conbuildmat.2021.124977
- Chen, J.; Huang, B.; Chen, F.; Shu, X. (2012). Application of discrete element method to Superpave gyratory compaction. *Road Materials and Pavement Design* 13(3), 480–500. doi:10.1080/14680629.2012.694160
- Wang, X.; Wang, Z.; Luo, X. (2025). Real-Time Optimization of Discrete Element Models for Studying Asphalt Mixture Compaction Characteristics at the Meso-Scale. *Sensors* 25, 638. doi:10.3390/s25030638
- Ai, X. et al. (2024). Advances in Discrete Element Modeling of Asphalt Mixture: A Literature Review. *Archives of Computational Methods in Engineering*. doi:10.1007/s11831-024-10104-8
- Li, X.; Zhang, Z.; Zhao, L.; Zhang, H.; Shi, F. (2024). Research on the Calibration Method of the Bonding Parameters of the EDEM Simulation Model for Asphalt Mixtures. *Coatings* 14, 1553. doi:10.3390/coatings14121553
- Albayati, A.H. (2024). Factors affecting asphalt concrete permanent deformation: Experimental dataset for uniaxial repeated load test. *Data in Brief* 53, 110224. doi:10.1016/j.dib.2024.110224

**Bases de dados**
- Ruf, M.; Teutsch, T.; Alber, S.; Steeb, H.; Ressel, W. (2021). micro-XRCT SMA 11 S drill core, sample 2-1. DaRUS, Universität Stuttgart. doi:10.18419/DARUS-1641 (CC BY 4.0).
- Thilakarathna, S. (2020). 3D Scanned Aggregates. Mendeley Data. doi:10.17632/x5dbx8yxdw.1 (CC BY 4.0).
- Albayati (2024), dados originais: Uniaxial Repeated Load Test Data of Asphalt concrete (Mendeley Data).
- FHWA Long-Term Pavement Performance (LTPP), InfoPave: tabela AC_LAB_MIX_EXP.

**Normas:** DNIT 031/2024-ES e 031/2006-ES; DNER-ME 043; ASTM D6926; AASHTO T 312, M 323, M 325; TL Asphalt-StB 07/13 (FGSV); EN 12697-35; EN 12591.

## 8. Como reproduzir

```bash
node build.mjs                                   # monta o app a partir de src/
node stress/golden.mjs --determinism             # âncora: deve dar "identical"
node stress/run.mjs stress/grids/smoke.json --jobs 6
```
Grades longas rodam no servidor (ver `stress/README.md` e `BRIEFING_chat_unificado.md`), sempre com Node 24.11.1.

**Distribuição (versão alfa 1.1.0a1):** `pacote/` é um mini app Python que abre o simulador numa janela própria (pywebview; WebView2 no Windows), com o three.js r128 (MIT) embutido para funcionar sem internet. `python pacote/build_pacote.py --exe` gera o wheel, o `MarshallSimulator.exe` (PyInstaller, Windows, sem Python) e o zip para os colegas. Desde a F10, a física do Marshall e do giratório roda no núcleo em C dentro do app: o mini app serve a página e o `mdsim` num servidor local, o worker manda a compactação para ele e mostra o progresso; sem o `mdsim`, a mesma simulação roda em JavaScript. No mesmo Marshall de 1200 g, o C levou 26 min (16 threads) e o JavaScript 76 min. O [W] continua em JavaScript até o C passar no golden (M14). O app abre parado; uma simulação nova cancela a anterior.

## Histórico

| Data | Mudança |
|---|---|
| 2026-10-29 | Repositório git criado; backlog consolidado (`melhorias/BACKLOG.md`); Node 24.11.1 fixado no servidor (I1); plataforma gravada em cada resultado (I2); app com Ajuda, Referências e copyright (PT/EN); este whitepaper |
| 2026-10-29 | Régua de medição corrigida (bloco 1 do backlog): K28 e K30 novos, K15 com N mínimo, K23 contando bolhas, K13 e K14 com limites úteis, K9 limpo, subidas da coluna registradas, golden por plataforma e K32. Achados: a correção das faces zera a camada sem vazios (K28 = 0); o protocolo [W] deixa o topo com mais vazios que a base (K30 = 0,46, item A14) |
| 2026-10-29 | A3: Marshall só em tamanho real (1200 g, Ø101,6 mm) e giratório com Ø150 mm por padrão; o molde pequeno ficou só no protocolo [W] |
| 2026-10-29 | A4: mola de pedra proporcional ao tamanho do contato e trava relativa (JS e C). Nos piores casos da calibração o K33 caiu de ~2 % para 0,3 %, o leito solto ficou mais denso (AVC 60 → 45 %) e o AVC previsto caiu 2–3 pp; a calibração será refeita |
| 2026-10-29 | A7: o excesso de mastique em misturas graúdas vinha do sorteio (massa até 3,9 % abaixo do alvo) e de uma régua errada no AVC livre (M15), não da pintura. O sorteio fecha a massa em ±0,5 %; o golden passa a ter NA = 569 |
| 2026-10-29 | A10: no [W], o pistão para quando o esqueleto trava, em vez de forçar as pedras umas dentro das outras (JS e C). Nos 5 casos que não cabiam no AVC alvo, o K8 caiu de 0,22–1,43 para 0,10–0,13 e o K33 de 5–21 % para 0,6–2,4 %; o AVC final fica entre 12,5 e 18 %, com aviso no app. Golden idêntico |
| 2026-10-29 | A8: bolhas só são semeadas inteiras no mastique, sem encostar em pedra, parede ou vazio do esqueleto (K19 de ~0,2 % para 0); quando não cabem, o app diz qual B ficou. Golden: Vmast e Vbol mudaram na 3ª casa, referência regravada |
| 2026-10-30 | A11: varredura da força radial k (0,5–2) × 3 sementes. A instabilidade do K14 vem do CP pequeno (poucas pedras nas faixas da borda), não de k = 1; em 1000 g o K14 é estável e fica na faixa com k = 1 e 2. Padrão mantido (k = 1); aviso PT/EN junto do campo |
| 2026-10-30 | A6: padrões do app com a calibração da A5 (λ 0,55, escala de energia 0,002; antes 0,3 e 0,005), também no worker e no harness |
| 2026-10-30 | F3: versão alfa 1.1.0a1 como mini app Python (janela própria, three.js embutido, `.exe` do Windows e wheel), no lugar do artefato |
| 2026-10-30 | F10: física do Marshall e do giratório no núcleo em C dentro do app (2,9× mais rápido que o JavaScript no Marshall de 1200 g); Marshall com animação, giratório só com o resultado; o app abre parado |
