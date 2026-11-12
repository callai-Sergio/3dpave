# Plano: realismo do CP e da animação, cálculo rápido no PC (2026-11-10)

Plano para ser executado em outro chat, por outro modelo. Ele se basta sozinho: tudo o que o executor precisa saber está aqui ou nos arquivos citados.

## 0. Antes de começar

**Repositório:** `/home/sergio/workspace/3dpave_repo` (máquina vid1, Linux). Branch `main`, versão 1.1.0a2.

**Ler primeiro, nesta ordem:**
1. `CLAUDE.md` (curto): máquina, Node, como compilar, regras e economia de tokens.
2. Este arquivo.
3. `melhorias/RESUMO_E_PROXIMOS_PASSOS.md`, que traz o estado verificado em 2026-11-10.

**O projeto.** É um simulador DEM (elementos discretos) que compacta corpos de prova (CPs) de mistura asfáltica em três protocolos: [W] (pistões, sem gravidade), Marshall (golpes do soquete) e giratório (SGC).
- O app fica em `src/`. O comando `node build.mjs` gera `marshall_digital_app.html`.
- O núcleo de física em C fica em `native/mdsim.c`.
- O harness de testes fica em `stress/`.
- O pacote Windows (EXE com o `mdsim` compilado, que calcula **no próprio PC**, sem servidor) fica em `pacote/` e só é gerado no PC do usuário.

**Regras que não se negociam** (estão no `CLAUDE.md`):
- Se uma mudança no C mexe só em velocidade, a saída tem de ser igual byte a byte: 5 casos × 1/4/16 threads × as duas flags (`stress/cref/README.md`).
- Se uma mudança mexe em física ou protocolo, ela passa pela calibração reduzida (`stress/grids/calib_red_pb*.json`, 12 rodadas no vid1). Meta: Marshall com MAE ≤ 0,5 pp de AVC.
- Depois de mexer no worker JS, rodar `node stress/golden.mjs --determinism`. **Nunca afrouxar o golden para passar.** Se uma mudança de física exigir nova referência, pare e peça ao usuário.
- Commit e push só com o OK do usuário. Mensagens em português, com o ID do item.
- Rodadas longas vão para segundo plano, com a saída num arquivo. Mostrar só as linhas de resultado. Ler arquivos grandes só por trecho (`grep -n` e depois `sed -n a,bp`).
- Os comentários do código são em português. Os textos novos da tela levam tradução EN em `src/ui/00_base.js` (`I18N_EN`).

## 1. Decisões do usuário (2026-11-10)

1. **Não calcular mais CPs de 250 g.**
   - Sai do app a opção "Rápido: 250 g em molde Ø65 mm" (`src/app/head.html`, `<select id="f-size">`, e `SIZES.p` em `src/ui/10_painel.js`).
   - Sai também do `pacote/TEST_PROTOCOL.md`, junto com os exemplos e textos que a citam.
   - O "teste rápido" passa a ser o **[W] 1000 g em Ø102 mm**. O caso de referência passa a ser o **Marshall 1200 g em Ø101,6 mm**.
   - **Não mudar:** o "por 250 g" de M e NA (`k250`, os controles `s-aM` e `s-aNA`, a nota `propnote`). É só a unidade da Eq. (3) de Awuah et al. e não manda calcular um CP de 250 g.
   - **Harness:** o `stress/engine.mjs`, o `stress/validacao.mjs` e algumas grades (`stress/grids/*.json`) usam o tamanho `p`. O golden e as provas do `cref` precisam continuar valendo. Antes de tirar o `p` do harness, levante onde ele é usado (`grep -rn "'p'" stress`) e **pergunte ao usuário**. A opção que recomendo: manter o `p` só como caso interno de regressão, sem aparecer no app.
2. **A mistura entra no molde só por cima.** Hoje a fase "reunir a mistura" aperta uma coluna solta por cima e por baixo, sem gravidade. Isso sai (bloco 4).
3. **A compactação de placas (slabs) fica para depois.** Ela está anotada como A15 no `melhorias/BACKLOG.md`. Não implementar nada dela agora.
4. **O exemplo giratório SMA 12,5 sai** (AVC irreal de 19,3 %, porque o giratório ainda não tem calibração, item A13). Isso vale até a A13 ficar pronta.
5. **Os exemplos e a release ficam para o fim** (bloco 5). Assim eles são recalculados uma vez só, depois de todas as mudanças que alteram o resultado.

## 2. Bloco 1: correções sem mudar a física

| # | Tarefa | Arquivos | Pronto quando |
|---|---|---|---|
| 1.1 | Pôr `-ffp-contract=off` em todos os lugares que compilam o `mdsim`. Motivo: o binário com `-march=native` usa FMA e calcula diferente do binário do pacote (`x86-64-v2`). Exemplo: no mesmo caso, a altura final deu 34,23 mm contra 37,03 mm | `pacote/build_pacote.py`, `pacote/gerar_exe.py`, `stress/server/deploy_native.sh`, `CLAUDE.md`, `stress/cref/README.md` | nativo e v2 dão saída idêntica nos 5 casos do `cref`; o nativo não fica mais lento (uma medida do Marshall 1200 g, base e nova rodando juntas) |
| 1.2 | Tirar o tamanho 250 g do app (decisão 1) | `src/app/head.html`, `src/ui/10_painel.js`, `src/ui/00_base.js` (textos e EN que citam o CP rápido) | o menu não oferece mais 250 g; um formulário salvo antigo com `p` cai num tamanho válido e mostra um aviso |
| 1.3 | Reescrever o protocolo de testes com os novos casos padrão | `pacote/TEST_PROTOCOL.md` (§ padrão, R1–R3, S, §6, §10.S) | nenhuma menção a 250 g nem a Ø65; cada teste dá para fazer no app atual |
| 1.4 | Tirar o exemplo giratório SMA 12,5 | `exemplos/index.json`, `exemplos/giratorio-us-sma-125.mdres.gz`, `stress/gerar_exemplos.mjs` | o menu Exemplos tem 6 casos |
| 1.5 | Atualizar os documentos | `melhorias/BACKLOG.md` (linha S2: Fase 1 e forças feitas), `melhorias/HANDOFF.md` (item 4: O2, O3 e O9 feitos; O1 e O4 faltando) | os documentos batem com o código |

Testes do bloco: `node build.mjs`, golden com `--determinism` e as provas do `cref`.

## 3. Bloco 2: animação (sem mudar a física)

**O que acontece hoje.** O código está em `src/ui/20_cena.js`, funções `setFrame` e `tickAnim`.
- A animação toca os quadros gravados a 24 por segundo, sem nada entre eles.
- Um quadro (`rec.snap` em `src/worker/25_protocolos.js`) pode cobrir um golpe inteiro do soquete. O resultado parece "um ataque epiléptico".
- No giratório, são ~6 quadros por giro. A inclinação real de 1,25° não aparece.

| # | Tarefa | Pronto quando |
|---|---|---|
| 2.1 | Interpolar entre dois quadros: posição linear e rotação por slerp do quaternion. Fazer o mesmo com o soquete, o molde e a placa | a animação corre lisa em qualquer velocidade |
| 2.2 | Tocar mais devagar por padrão: Marshall a ~1 golpe por segundo, giratório a ~1 giro por segundo. Manter o controle de velocidade (`speed`) e mostrar o golpe ou giro atual | dá para acompanhar cada golpe a olho |
| 2.3 | Gravar mais quadros por golpe (soquete descendo, impacto, volta), sem aumentar demais o resultado. Lembrar que o `.mdres.gz` guarda metade dos quadros | cada golpe tem pelo menos ~4 quadros; o `.mdres.gz` de um exemplo não passa de ~25 MB |
| 2.4 | Giratório: mostrar o molde girando de forma contínua (o ângulo `phi` interpolado) e a placa de cima. Dar uma opção para **exagerar a inclinação só no desenho** (ex.: ×5), ligada por padrão e com uma etiqueta na tela | o movimento lembra um SGC de verdade; a etiqueta diz que a inclinação está exagerada |
| 2.5 | A queda da mistura vem por cima, de um funil ou concha acima do molde. Isso só fica completo com o bloco 4.1; até lá, esconder a fase "reunir" da animação | nenhuma partícula sobe nem entra por baixo |

**Testes do bloco:** o golden não pode mudar.
- Se só a gravação de quadros (`rec.snap`) mudar, o golden deve continuar idêntico. Confira.
- Teste no Chrome com um exemplo de cada protocolo.

## 4. Bloco 3: superfície realista e AVC sem os vazios superficiais (muda a física)

**O que acontece hoje.** O código está em `src/worker/40_pipeline.js`, mais `30_voxel.js` e `20_cena.js`.
- O CP é uma grade de voxels. O mastique preenche tudo até a parede e as faces, e a lateral é desenhada como um cilindro liso (`CylinderGeometry(R+0.05, …, 128)`).
- O AVC usa o volume do cilindro inteiro: `Vcp = área × H`, com `st.AVC = (cnt[2]+cnt[3])/ncyl`.
- Nos CPs reais (foto do usuário), o betume não veda a superfície. Há reentrâncias entre as pedras, na lateral e nas faces.
- No laboratório, o volume do CP é medido pela massa saturada com a superfície seca, ou com parafilme. Por isso as reentrâncias **não entram no AVC**.

**Defeito ligado a isso: vazios alinhados a 90° na lateral.** A hipótese abaixo tem de ser confirmada primeiro.
- A grade é cartesiana, e a distância chanfrada 3-4-5 (`chamfer`) não mede igual em todas as direções.
- Nos eixos x e y (0°, 90°, 180° e 270°), a borda do cilindro de voxels é reta e fica mais para fora. Os vazios encostados na parede aparecem através da pele lisa só nesses quatro pontos.

**Como confirmar:**
- Contar os voxels de vazio na casca de 1 mm junto à parede, por setor de ângulo de 10°. Hoje devem aparecer picos a cada 90°.
- Medir até onde a malha de vazios (`surfaceMesh`, que é subamostrada e suavizada) passa do raio R.

| # | Tarefa | Pronto quando |
|---|---|---|
| 3.1 | Confirmar a causa dos 90° (acima) e corrigir: máscara do cilindro por distância exata ao eixo e distância euclidiana (ou correção da chanfrada) junto à parede | o histograma por setor fica plano, sem picos a cada 90° |
| 3.2 | **Camada de textura:** numa casca junto à lateral e às faces, com espessura ligada ao tamanho das pedras da superfície, os espaços entre as pedras que tocam a parede ficam abertos para fora. Eles viram uma nova fase, "externo", e não são vazio | no corte, a borda tem reentrâncias como na foto |
| 3.3 | O AVC passa a usar o volume **sem** as reentrâncias, como no ensaio. Mostrar no painel também a textura (cm³ ou mm de profundidade média) | o painel separa "AVC" de "reentrâncias da superfície" |
| 3.4 | Desenhar a lateral e as faces pela superfície dos voxels (agregado aparente e mastique), em vez da pele lisa. Na superfície, as reentrâncias não são desenhadas como bolhas vermelhas; as bolhas (`C_BUB`) só ficam dentro do CP | a vista externa lembra a foto; nenhuma bolha vermelha na superfície | **Feito 2026-11-12** (película de 1,5 mm transparente; ver HANDOFF) |
| 3.5 | Recalibrar com a calibração reduzida, porque a mudança do AVC desloca os resultados | Marshall com MAE ≤ 0,5 pp; o golden ganha nova referência **só com o OK do usuário** |

Antes de escrever o código da 3.2 e da 3.3, apresente ao usuário a definição da casca e de como ela é medida, e espere o OK. A física muda aqui.

## 5. Bloco 4: cálculo rápido no PC normal

**Situação:**
- O EXE já calcula no PC com o `mdsim`. O problema é o tempo.
- No vid1, com 4 threads: Marshall 1200 g ≈ 253 s; giratório 1000 g ≈ 341 s.
- Giratório Ø150 (11 046 partículas, 16 threads), 1000 s no total: reunir 282 s, queda 239 s, giros 441 s, pós-DEM 38 s. Num PC com 4–8 núcleos, isso deve passar de 40 min.
- **Meta:** giratório Ø150 em ≤ 15 min e Marshall 1200 g em ≤ 4 min, num PC de 4–8 núcleos.
- **Primeiro medir no PC.** O usuário roda o EXE e anota o tempo de cada fase, que o contador O9 já mostra. Esses números decidem quanto do 4.4 é preciso.

| # | Tarefa | Ganho esperado | Prova |
|---|---|---|---|
| 4.1 | **A mistura entra por cima** (`deposit` em `src/worker/25_protocolos.js` e o lado C). Trocar a coluna de 822 mm apertada por cima e por baixo por uma colocação geométrica da mistura solta já dentro do molde (assentamento sequencial de cada partícula sobre as de baixo, com a forma real), seguida de uma queda curta só com gravidade | corta a maior parte dos 282 s de "reunir"; se começar baixa, a queda também encurta | muda a física: calibração reduzida |
| 4.2 | **Guardar a mistura solta** (O6): a chave é o hash da granulometria, da massa, do molde, da semente e das formas. Com essa chave, repetir o caso mudando só a compactação começa da mistura guardada | −52 % no giratório Ø150 quando só a compactação muda | resultado igual ao de rodar do zero com a mesma mistura guardada |
| 4.3 | **Guardar resultados** (O1): o servidor Python do pacote (`pacote/src/…`) calcula o hash da entrada do `mdsim` e guarda a saída numa pasta do usuário | repetir um caso leva segundos | o mesmo hash dá o mesmo resultado; depende do 1.1 |
| 4.4 | Só se ainda faltar: S2l (queda mais curta), S6a (passo de tempo 2× com escala de inércia) e S6g (menos giros simulados). Para cada um, ver a linha no BACKLOG (`grep -n "S6a" melhorias/BACKLOG.md`) | de 1,3× a 2× cada | calibração reduzida |
| 4.5 | Mostrar antes da rodada uma estimativa de tempo, pelo número de partículas e de threads | o usuário sabe quanto vai esperar | estimativa dentro de ±30 % no vid1 |

Fazer o 4.1 junto com o bloco 3, numa só calibração. As duas mudanças mexem no resultado.

## 6. Bloco 5: fechamento

1. Recalcular os exemplos com o binário de 1.1, com `stress/gerar_exemplos.mjs` em segundo plano (~1 h ou mais no vid1). Conferir que cada `.mdres.gz` abre.
2. Commitar e fazer push, com o OK do usuário. **Avisar antes:** cada push dos exemplos pelo Git LFS gasta ~96 MB da cota grátis de 1 GB por mês.
3. Com isso, o usuário gera o EXE no PC (`pacote\construir_no_pc.bat`) e testa. Depois vem a release prévia no GitHub. O `gh` no vid1 está com o token expirado: o usuário roda `gh auth login`.
4. Atualizar `melhorias/RESUMO_E_PROXIMOS_PASSOS.md` e `melhorias/HANDOFF.md` em poucas linhas.

## 7. Ordem sugerida

1. **Bloco 1:** curto, sem física. Commit separado, com o OK do usuário.
2. **Bloco 2:** só desenho e gravação de quadros. Commit separado. Pode ir para o PC antes dos blocos 3 e 4.
3. **Medir no PC:** o usuário anota os tempos por fase.
4. **3.1:** a causa dos 90°, com a prova do histograma.
5. **Blocos 3 e 4.1 juntos:** proposta ao usuário, código, uma calibração reduzida.
6. **4.2 e 4.3:** os caches. Depois o 4.4, só se os tempos do PC pedirem.
7. **Bloco 5.**

Em cada passo, mostrar ao usuário o que mudou e o que ficou sem verificação. Parar e perguntar quando uma regra da seção 0 for bater contra a tarefa.

## 8. Fora deste plano

- A15, compactação de placas (slabs): só a nota no BACKLOG.
- A13, calibração do giratório: espera as curvas altura × giro do laboratório (teste T7).
- P3 do resumo: M14, A14, F4–F8, M7, M12, M13, S5.
