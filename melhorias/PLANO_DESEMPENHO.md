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

**Passo de tempo.** Para a menor pedra (Min Feret 2,0 mm) √(m/k) = 6,4e-5 s e contra a parede 4,6e-5 s. O dt = 2e-5 s está em 0,31–0,44 de √(m/k); o limite de estabilidade do integrador é ~2, e o usual em DEM é 0,1–0,2 do período de contato (π√(m/k)), ou seja ~4e-5 s. Só 17 % das partículas (0,8 % da massa) têm Min Feret < 3 mm, e são elas que limitam o dt.

## 2. Plano

(seção preenchida abaixo)
