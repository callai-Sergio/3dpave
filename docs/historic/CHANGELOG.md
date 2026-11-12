# Histórico (CHANGELOG)

Gerado do `git log`; detalhes por dia em `docs/historic/AAAA-MM-DD.md`. Estado atual: `melhorias/HANDOFF.md`, `melhorias/BACKLOG.md`.


## 2026-10-29: Estado base, unificação e calibração A3–A11 (13 commits)
- `72a218d` Estado base do Marshall Digital + backlog consolidado (melhorias/BACKLOG.md)
- `4cc9c43` I1, I2: Node 24.11.1 fixo no servidor e plataforma em cada resultado
- `a98607d` F9: ajuda, referências e copyright no app (PT/EN) + WHITEPAPER.md
- `c1dd198` M2b, M2d, M3-M6, M8-M11: régua de medição corrigida (bloco 1)
- `99cb137` A3: Marshall só em tamanho real; giratório com Ø150 por padrão
- `285e6d8` A4: mola de pedra proporcional ao tamanho do contato (JS e C)
- `0a3257d` A5: grade de calibração m2 (96 rodadas) iniciada no vid1 com o núcleo C da A4
- `d022b81` Backlog: golden no vid1 (K32 0,02 % pass; parede radial sensível à plataforma)
- `b9fb0f8` A7, M15: sorteio fecha a massa por fração; K2/K3/K7 com a escala certa no AVC livre
- `dce6471` Docs da A7/M15: backlog (status e medições) e whitepaper
- `d90531a` A5 reiniciada no vid1 com a A7 (sorteio que fecha a massa)
- `e923ed2` A10: no [W], o pistão para quando o esqueleto trava
- `1b0d245` A8: bolhas inteiras no mastique e aviso do B que coube

## 2026-10-30: Motor em C (F10), calibração e otimização S2a–S2n (27 commits)
- `85b0f0b` A11: força radial k × banheira radial (K14) e aviso no app
- `c4f0686` A5: calibração com 3 sementes no vid1 (lambda 0,55, escE 0,002, MAE 0,31 pp)
- `e050a52` A6: padrões do app calibrados (lambda 0,55, escE 0,002)
- `dbdea07` F3: versão alfa 1.1.0a1 como mini app Python, sem artefato
- `871fb43` Backlog: release v1.1.0a1; F10 e S2 sobem para alta (motor em C no app)
- `029731a` F10 (em andamento): núcleo em C dentro do mini app
- `1a84f0f` F10: Marshall com animação e giratório sem animação, ambos em C; .exe com o mdsim
- `8e5acfb` F10: o app abre parado e uma simulação nova cancela a anterior
- `085d570` F10: ao fechar o app, o cálculo em andamento para junto
- `241f18d` F10: comparação JS x C (76 x 26 min) e perfil do mdsim para o S2
- `0dbc4da` A3b: o corpo de prova segue a compactação (Marshall → CP Marshall, giratório → CP do giratório)
- `18b32bb` S2: perfil do núcleo C no Marshall 1200 g (rascunho do plano de desempenho)
- `6eeb6ed` S2: plano de desempenho completo (perfil, revisão Fable e teste de dt)
- `9c38ed8` A3c: CP do giratório com 115 mm de altura; massa pela densidade da mistura
- `8b4b9eb` A3d: CP Marshall com 63,5 mm de altura e golpe da norma fixo no molde real
- `b5530a2` S2a: régua de desempenho no núcleo C (timers por etapa atrás de MD_PROF=1)
- `796e539` S2b: varredura parcial sem cópia elemento a elemento e CSR em paralelo
- `d41ca75` S2c: candidato sem força marcado com 1 byte em vez de zerar 80 bytes
- `8db141d` S2d: conferência de movimento por partícula e paredes só para grãos perto delas
- `515b617` S2g: penetração pela casca (K33) em paralelo
- `16f0b84` S2e: planos e pontos de prova em vetores separados (SoA) e laços vetorizáveis
- `c22b2a4` S2f: lista de pares (buildPairs) em paralelo com a mesma ordem
- `3690a41` S2m: soma por partícula pelos pares; o CSR partícula → candidato deixa de existir
- `ba034db` S2n: candidatos em faixas fixas por par; a varredura parcial regrava só os pares revarridos
- `1e92248` S2 Fase 1: status no backlog, medições antes/depois do caso 1200 g e linha no histórico
- `abb7885` S2: grades da calibração reduzida (Fase 2), uma por Pb
- `1a4a5f2` S2i (em andamento, não verificado): patch salvo; Fase 2 parada por falta de créditos

## 2026-11-02: Exemplos em LFS, pacote Windows e S2o–S2s (8 commits)
- `25385e0` S2o–S2s: forças 10–18 % mais rápidas com o mesmo resultado; S2i e S2j medidas e descartadas
- `93da6b0` Merge pull request #1 from callai-Sergio/claude/adoring-pasteur-s243xl
- `c242d1b` O2: 7 exemplos prontos (Marshall e giratório, curvas DNIT, TL Asphalt e AASHTO) calculados no vid1, em Git LFS
- `f39e89d` O2/O3/O9: abrir e salvar resultado, menu Exemplos, contador de tempo decorrido e animação do giratório; pacote 1.1.0a2
- `ce7d6a9` Documentação: CLAUDE.md, HANDOFF, planos de rapidez/testes e de exemplos, provas do núcleo C (stress/cref)
- `3f0a355` HANDOFF: estado depois do push (pacote 1.1.0a2, construir_no_pc.bat)
- `cc07787` Pacote: gerar_exe.py gera EXE, wheel e zip com um comando no PC (confere Git/LFS, puxa os exemplos, instala as ferramentas)
- `e5587eb` Pacote: o hash do three.js vale com LF ou CRLF (Git do Windows converte); three.min.js marcado como binário

## 2026-11-10: Bloco 1–3: protocolo, animação e mastique (7 commits)
- `584705d` 1.1: -ffp-contract=off em toda compilação do mdsim (nativo e pacote dão a mesma saída)
- `b749ecd` 1.2: CP rápido de 250 g (Ø65) sai do app
- `2b68a8f` 1.3: TEST_PROTOCOL.md v2, sem o CP de 250 g
- `f855b72` 1.4: exemplo giratório SMA 12,5 removido (AVC irreal até a A13); ficam 6 exemplos
- `21d9f6b` 1.5: BACKLOG (S2 parcial, A15), HANDOFF, resumo de 2026-11-10 e plano de realismo e PC
- `d2c8c21` Bloco 2: animação interpolada, 1 golpe ou giro por segundo, soquete e molde giratório, .mdres.gz formato 2
- `08d3848` 3.1: distância exata à parede lateral na pintura do mastique (fim dos vazios a cada 90°)

## 2026-11-11: Vazios na superfície (3.2/3.3) (1 commits)
- `daeb644` 3.2 e 3.3: reentrâncias da superfície (fase "externo") e AVC sem a textura

## 2026-11-12: Trabalho do dia (2 commits)
- `a549805` Cena 3D: vazios desmarcados não são pintados de vermelho nas tampas e no corte (mostra o que está atrás, escurecido)
- `c373bd3` HANDOFF: retorno do usuário no Chrome e PA 8 lento no PC
