# Plano de desempenho: Marshall e giratório em minutos (2026-10-30)

Meta: **Marshall 1200 g com os 75 golpes por face em menos de 5 min** num PC comum (hoje 26–30 min no C e ~40 min no navegador) e **giratório Ø150 em menos de 15 min**. Sem perder o que já foi validado: golden [W], determinismo e a calibração do Marshall (A5: λ 0,55, escE 0,002, MAE 0,31 pp).

## 1. Onde o tempo vai (medido)

Caso: Marshall 1200 g, Ø101,6, AVC livre, formas RT, Pb 5 %, semente 2024, 5 golpes simulados por face (o caso do `s2_perfil`). Núcleo C (`native/mdsim.c`) com timers por etapa, 4 threads, VM de nuvem (4 núcleos). 2244 partículas, 57 pontos de prova e 92 planos por casca em média.

**Por fase do protocolo**

| Fase | Tempo simulado | Passos (dt = 2e-5 s) | Parede | ms/passo | Parte |
|---|---|---|---|---|---|
| Reunir a mistura (pistões de 485 → 95 mm) | ~1,3 s | ~65 mil | 169 s | 2,6 | 35 % |
| Queda de 20 mm e repouso | ~0,47 s | ~23 mil | 140 s | 6,0 | 29 % |
| 10 golpes simulados (+ assentamento) | 0,38 s | ~19 mil | 178 s | 9,4 | 36 % |
| **Total** | 2,16 s | 108 mil | **487 s** | 4,5 | |

As duas primeiras fases (64 %) são artifícios para montar a massa solta no molde; o ensaio de verdade são os golpes. Com **todos os golpes** (o padrão do app e o que a calibração A5 usou), são 150 golpes de ~0,02–0,03 s cada: ~150 × 1500 passos × 9 ms ≈ 2000 s em 4 threads só nos golpes. Por isso a calibração levou 1600–1800 s por rodada no vid1.

**Por etapa do passo (mesma rodada)**

| Etapa | Parede | Parte | Observação |
|---|---|---|---|
| Varredura de candidatos (`scanCandidates`/`scanPair`/`probeIn`) | 236 s | **48 %** | refeita em 79 % dos passos (85,6 mil parciais + 3,2 mil completas); cada uma reconstrói o CSR partícula → candidato em série |
| Forças por par (`probeQuick`, molas, lubrificação) | 107 s | 22 % | 60 mil candidatos e 12 mil pares em média |
| Forças por partícula (soma, paredes, placas) | 74 s | 15 % | as paredes testam todos os 57 pontos de prova contra cilindro e placas |
| Rotações (pontos de prova no mundo) | 29 s | 6 % | |
| Integração | 21 s | 4 % | |
| `buildPairs` (grade de células, serial) | 19 s | 4 % | 3227 vezes |

**Escala com threads** (mesma fase, mesmo passo): 4 threads = 2,3× uma thread; 4 contra 2 = 1,5×. No PC, 16 threads deram 1554 s contra 1613 s com 4 no vid1 (S2). O passo tem só ~2 mil partículas: as partes seriais (montagem do CSR, verificação de deslocamento, somas de força e energia, `buildPairs`) e a abertura de ~6 regiões paralelas por passo dominam depois de 4 threads.

**Passo de tempo.** Para a menor pedra (Min Feret 2,0 mm), ω·dt = 0,31–0,44 na translação, mas **1,49 na rotação** (revisão Fable), contra o limite ~2 do integrador. O dt de 2e-5 s já está a ~75 % do limite: não dá para dobrar sem escalar a inércia das pedras pequenas. Só 17 % das partículas (0,8 % da massa) têm Min Feret < 3 mm, e são elas que limitam o dt.

**Com todos os golpes** (padrão do app): ~270 mil passos, dos quais ~65 % nos golpes, 24 % em reunir a coluna e 5–15 % na queda. O PC (16 threads) faz 5,7 ms/passo e a VM de 4 núcleos ~6 ms: o passo é limitado pelas partes seriais e pela memória, não pelo número de núcleos.

**Causas principais** (`native/mdsim.c`, linhas de hoje):

1. **Varredura parcial quase todo passo** (263–267): basta *um* ponto de prova andar 0,075 mm. Cada chamada copia todos os candidatos um a um (`bufPush`, 183, buffers liberados e realocados a cada vez, 194), concatena e refaz em série o CSR partícula → candidato (198–204). É o que impede a escala.
2. **`buildPairs` com células de 40,5 mm** (88–119): 2·bmax + folga + alcance, num molde de 101,6 mm → 5 × 5 × 3 células; o estêncil de 27 células cobre o CP inteiro (~n²/2 testes, 5 ms em série). E cada reconstrução força uma varredura completa de todos os pares (118).
3. **Tráfego de memória no laço por par** (275): zera 80 bytes por candidato por passo, mesmo quando não há força (2/3 dos casos); o laço por partícula relê tudo. ~10 MB por passo.
4. **Laços sobre os 128 mil pontos de prova** a cada passo: rotações, conferência de movimento e paredes (com `sqrt` por ponto).
5. **Fases artificiais**: reunir a coluna (a `placeColumn` testa esferas envolventes e deixa a coluna com 12 % de sólidos), parte da queda e 0,005 s de assentamento depois de cada golpe (150 × 250 = 37 mil passos).


## 2. Regras de validação

Três categorias de mudança, cada uma com a sua prova:

| Cat. | O que muda | Prova |
|---|---|---|
| **I** | Só velocidade: resultado bit a bit igual | Referência do C gravada antes (AVC e Vagg com 12 casas no caso `s2_perfil`, `bench_native.mjs`), conferida com 1, 4 e 16 threads; `golden.mjs --determinism` idêntico; smoke sem mudança |
| **II** | Mesmo modelo, outra ordem de soma ou outro instante de varredura; fases artificiais mais curtas | Referência regravada (`--record`, com o porquê no commit); determinismo; smoke dentro do ruído; calibração reduzida (λ 0,55 × escE 0,002 × 4 Pb × 3 sementes = 12 rodadas): MAE ≤ 0,5 pp e cada Pb dentro de 1 dp entre sementes (0,5–0,8 pp) |
| **III** | Muda a física ou o protocolo (dt com escala de inércia, golpes simulados) | Grade de calibração completa (`calib_albayati_m2.json`); aceitar se MAE ≤ 0,5 pp e inclinação ±30 %, senão recalibrar escE; K13 e K33 sem piorar |

Cada mudança é um commit com o ID abaixo e o tempo antes/depois no `BACKLOG.md`. Os timers por etapa ficam no `mdsim.c` atrás de `MD_PROF=1`, para medir sempre do mesmo jeito.

## 3. Fase 1: velocidade pura no núcleo C (categoria I)

| ID | Mudança | Onde | Ganho esperado |
|---|---|---|---|
| S2a | Timers por etapa atrás de `MD_PROF`; referência C bit a bit | `mdsim.c`, `bench_native.mjs` | — (régua) |
| S2b | Varredura parcial sem cópia elemento a elemento: buffers por thread persistentes, blocos de pares sem mudança copiados com um `memcpy`, CSR montado em paralelo | `scanCandidates` | parte serial 3–4 → ~1 ms por varredura; 1,5–2× com 16 threads |
| S2c | Marcar candidato sem força (1 byte) em vez de zerar 80 bytes; o laço por partícula pula | laço por par e por partícula | 1,3–1,5× nesses laços |
| S2d | Conferência de movimento por partícula (limite pelo centro + rotação × raio) antes de olhar os pontos; fundir com as rotações; paredes só para grãos perto delas | `run` | ~0,7 ms/passo em 1 thread |
| S2e | Planos e pontos em vetores separados (SoA) e laços que vetorizam em `probeIn`/`scanPair`, sem FMA para manter os bits | `probeIn`, `scanPair` | varredura completa ~2× |
| S2f | Uma região OpenMP por passo (barreiras no lugar de 5 aberturas) | `run` | ~0,1 ms/passo |
| S2g | `penetration()` em paralelo | fim do caso | ~1 s por caso |

**Meta da Fase 1:** de ~5,7 para ~2,5 ms/passo com 16 threads. Marshall com todos os golpes: **26 → ~11 min no PC**.

## 4. Fase 2: mesmo modelo, menos trabalho (categoria II)

| ID | Mudança | Onde | Ganho esperado |
|---|---|---|---|
| S2h | Somar as molas de cada par num registro por par (ordem fixa) e eliminar o CSR de candidatos; a varredura parcial vira O(partículas que andaram) | `run`, `scanCandidates` | com S2b: ~3× com 16 threads, ~2× com 4 |
| S2i | `buildPairs` com grade fina (célula ~2× o raio mediano, estêncil por tamanho ou duas grades: ≥ 8 mm e < 8 mm), em paralelo, pares em ordem (i, j); na reconstrução, varrer só pares novos ou que andaram | `buildPairs` | tira ~80 ms a cada 14–90 passos: 1,3–2× |
| S2j | Folga da lista de pares 0,6 → 1,5 mm e margem dos candidatos 0,15 → 0,4 mm | constantes | varreduras 3–5× mais raras: 1,2–1,5× |
| S2k | Coluna inicial mais densa: testar sobreposição pelo eixo entre centros (como `scanPair`) em vez da esfera envolvente → coluna de 150–200 mm em vez de 485 mm; ou pistões de 300 → 600 mm/s | `placeColumn` (JS), `deposit` | −45 mil passos (−15 a −20 % do total) |
| S2l | Queda: sair mais cedo (ke em repouso) ou amortecimento 1 → 3 | `deposit` | −10 a −20 mil passos |
| S5 | Navegador: compilar o próprio `mdsim.c` para WebAssembly (Emscripten, SIMD, threads via SharedArrayBuffer com COOP/COEP servidos pelo mini app); o JS fica como reserva | `native/`, `26_nativo.js`, `pacote/` | 1,5–2× sobre o JS numa thread, ~N× com threads; um só código para otimizar |

**Meta da Fase 2:** ~215 mil passos a ~1,3 ms com 16 threads → **Marshall completo em ~5 min no PC**; ~13 min num notebook de 4 núcleos.

## 5. Fase 3: física e protocolo (categoria III, com recalibração)

| ID | Mudança | Ganho esperado | Risco |
|---|---|---|---|
| S6a | dt 2e-5 → 4e-5 com escala de inércia (massa ×4, inércia ×9) só nas pedras < 3 mm (17 % das partículas, 0,3 % da massa) | **2× em tudo** | baixo no quase estático; vigiar K13 e o impacto do soquete |
| S6b | Golpes simulados: 25 por face em vez de 75 (cada um com a energia de 3), testando 25/38/75 | até 2,5× no total | o s2 com 5 por face deu +0,8 pp de AVC: exige grade |
| S6c | Assentamento depois de cada golpe 0,005 → 0,001 s | −30 mil passos | baixo |

**Teste feito (2026-10-30): dt dobrado sem escala de inércia**, mesmo caso do perfil (4 threads, VM de nuvem):

| | dt 2e-5 | dt 4e-5 |
|---|---|---|
| Tempo do DEM | 487 s | 330 s (só 1,5×: a varredura não cai junto) |
| AVC solto / após os golpes | 44,5 % / 8,0 % | 42,2 % / 3,1 % |
| Vezes que a trava de velocidade agiu (`vcap`) | 699 | 3110 |

Dobrar o dt sem mais nada muda o AVC em −4,9 pp e aciona a trava de velocidade 4,4× mais: sinal de instabilidade nas pedras pequenas, como a revisão Fable previu (rotação a ω·dt 1,49). Fica descartado; a S6a só entra com a escala de inércia e a grade de calibração.

**Meta da Fase 3:** Marshall completo em **3–4 min num PC de 4 núcleos**.

## 6. Projeção

| | Hoje | Fase 1 | Fase 2 | Fase 3 |
|---|---|---|---|---|
| Marshall 1200 g, todos os golpes, PC 16 threads | 26 min | ~11 min | **~5 min** | ~2 min |
| idem, notebook 4 núcleos | ~30 min | ~20 min | ~13 min | **3–4 min** |
| Giratório 4700 g Ø150 (≈ 4× partículas) | > 1 h | ~40 min | ~20 min | **< 15 min** |
| Navegador sem o mdsim (JS) | 76 min | — | WebAssembly: ~20–40 min | ~10 min |

Os números das Fases 2 e 3 são estimativas a partir do perfil; cada item mede o antes/depois real. Para o giratório, a S2i é obrigatória: sem ela o `buildPairs` cresce com n² (16× mais lento com 4× partículas).

**Conclusão:** só código (Fases 1 e 2) dá ~5× e chega a ~5 min num PC bom. Para ficar abaixo de 5 min num PC comum, é preciso a Fase 3 (dt com escala de inércia ou menos golpes simulados), e ela passa pela grade de calibração.

## 7. Ordem de trabalho

1. S2a (régua) → S2b → S2c → S2d → S2f → S2e → S2g. Um commit por item, referência C idêntica.
2. S2i → S2h → S2j; depois S2k e S2l. Calibração reduzida (12 rodadas) ao fim do bloco.
3. S6a e S6b com a grade completa no vid1 (já vai rodar bem mais rápido depois das Fases 1–2).
4. S5 (WebAssembly) quando o núcleo C estiver estável, para não otimizar dois códigos.

## 8. Outros pontos vistos no repositório

- **Fins de linha misturados**: parte de `src/` está em CRLF (vinda do Windows) e parte em LF. O `marshall_digital_app.html` muda centenas de linhas só por isso quando o build roda em Linux. Proposta: `.gitattributes` com `* text=auto eol=lf` e uma normalização num commit só.
- **Pacote desatualizado**: `pacote/src/marshall_simulator/web/marshall_digital_app.html` é anterior às últimas mudanças da UI; refazer com `pacote/build_pacote.py`.
- **Golden do C** (M14): o golden [W] só vale para o JS. Com a referência do C da S2a, o C passa a ter a sua própria âncora.
- **Arquivos grandes antigos**: `marshall_digital(1)/…/V5_visualizador.html` (2 × 10 MB) e `legacy_2026-10-28/` só servem de histórico; podem sair do repositório (ficam no histórico do git).
- **Sem CI**: um workflow com `node build.mjs`, `golden.mjs --determinism` (Node 24.11.1) e a compilação do `mdsim.c` pegaria regressões antes do merge.
