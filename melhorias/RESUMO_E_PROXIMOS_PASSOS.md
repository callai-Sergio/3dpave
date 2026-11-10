# Resumo e próximos passos (verificado em 2026-11-10, no vid1)

## 1. Estado agora

| | |
|---|---|
| `main` (GitHub) | `e5587eb` (02/11), versão do pacote **1.1.0a2** |
| Sem commit no vid1 | `pacote/TEST_PROTOCOL.md` (novo), `pacote/build_pacote.py` (põe o protocolo no zip), `melhorias/HANDOFF.md`, este arquivo |
| Build | `node build.mjs` não altera o HTML commitado |
| Golden JS | as 12 referências passam; K26 (determinismo) idêntico; K32 = 0,000 % contra o Windows; veredito `warn` (K15, K23, K30), o mesmo de antes |
| Núcleo C | `native/mdsim.c` sem mudança desde as provas da S2o–S2s (`25385e0`) |
| `gh` no vid1 | **token expirado** (HTTP 401): sem PR nem release daqui até rodar `gh auth login` |
| Pacote no Windows | `.exe` ainda não gerado nem testado no PC; não há zip no vid1 (só nasce no PC) |

## 2. O que foi feito

**Núcleo C (velocidade, mesmo resultado bit a bit)**
- **Fase 1** (S2a–S2g, S2m, S2n): o caso do perfil passou de 400,8 para 202,6 s com 4 threads.
- **Forças** (S2o–S2s):
  - Marshall 1200 g: 292,8 → 253,2 s com 4 threads e 96,2 → 86,1 s com 16.
  - Giratório 1000 g: 417,5 → 340,6 s com 4 threads.
- **Medidas e descartadas:** S2i (grade fina na lista de pares) foi +26 % mais lenta no giratório Ø150; S2j (folgas maiores) não ganhou nada.

**App**
- CP por protocolo (A3b–A3d): Marshall Ø101,6 × 63,5 mm; giratório Ø150 × 115 mm, com a massa calculada pela densidade.
- Exemplos prontos (O2): 7 casos em `exemplos/`, guardados no Git LFS (96 MB).
- Salvar e abrir resultado em `.mdres.gz` (O3).
- Contador de tempo decorrido por etapa (O9).
- Animação do giratório religada.

**Pacote**
- `gerar_exe.py` e `construir_no_pc.bat` geram o EXE, o wheel e o zip com um comando no PC, conferindo o Git e o LFS.
- O three.js vai embutido, com um hash que vale com LF ou CRLF.

**Medição do giratório Ø150** (16 threads, 11 046 partículas): 1000 s no total.

| Fase | Tempo |
|---|---|
| Reunir a mistura | 282 s |
| Queda | 239 s |
| Giros | 441 s |
| Pós-DEM | 38 s |

Reunir a mistura e a queda somam 52 % do tempo.

**Documentação e ferramentas**
- `CLAUDE.md` e `melhorias/HANDOFF.md`.
- O plano de rapidez e testes, [publicado como página](https://claude.ai/artifact/1EWf18Fvdu3uw3FSMCrAvF).
- `stress/cref/`, com as provas byte a byte e o amostrador que substitui o `perf`.
- `pacote/TEST_PROTOCOL.md`, o protocolo para os colegas.

## 3. Problemas encontrados nesta verificação

1. **O vid1 e o PC calculam resultados diferentes para a mesma entrada.**
   - Causa: o `mdsim` compilado com `-march=native` (vid1) usa FMA, e o do pacote (`-march=x86-64-v2`) não.
   - Tamanho: no Marshall 250 g livre, a altura final foi 34,23 mm contra 37,03 mm. Os 7 exemplos prontos foram calculados com o binário nativo, então não são o que o EXE calcularia para a mesma entrada.
   - **Correção testada:** com `-ffp-contract=off`, o binário nativo dá saída byte a byte igual à do pacote (conferido em 2 casos) e não fica mais lento.
2. **O protocolo de teste não bate com o app.** O `TEST_PROTOCOL.md` diz que o padrão é "Marshall, Quick 250 g em Ø65", mas o app só deixa o Marshall em Ø101,6. Os testes R1–R3 e o §6 precisam de outro caso: o [W] 250 g para testes rápidos, ou o Marshall 1200 g.
3. **Exemplo irreal:** o giratório SMA 12,5 dá AVC de 19,3 %, porque o giratório ainda não tem calibração (A13). Hoje o exemplo só leva um aviso.
4. **Não testado no EXE:** salvar resultado (arquivos de 10–20 MB passados em base64 pelo pywebview) e o menu Exemplos.
5. **Textos novos sem tradução EN:** exemplos, salvar/abrir e o contador de tempo.
6. **Documentos desatualizados:**
   - No `BACKLOG.md`, a linha S2 ainda diz "falta", embora a Fase 1 e as forças estejam feitas.
   - No `HANDOFF.md`, o item 4 diz "Onda 1 não começada", mas O2, O3 e O9 já estão feitos; O1 e O4 continuam faltando.
7. **Cota do Git LFS:** o plano grátis do GitHub dá 1 GB de banda por mês, e cada clone ou `pull` completo gasta 96 MB.

## 4. O que falta no código, por prioridade

**P0, antes de mandar aos colegas**
- Adicionar `-ffp-contract=off` em todos os lugares que compilam o `mdsim`:
  - `pacote/build_pacote.py` e `gerar_exe.py`;
  - `stress/server/deploy_native.sh`;
  - `CLAUDE.md` e `stress/cref/README.md`.
  No pacote o resultado não muda, porque o `x86-64-v2` já não tem FMA.
- Recalcular os 7 exemplos com esse binário, para que cada exemplo seja exatamente o que o EXE calcula: `stress/gerar_exemplos.mjs`, ~1 h no vid1.
- Corrigir o `TEST_PROTOCOL.md`: padrão e casos R1–R3.
- Decidir sobre o exemplo giratório SMA 12,5: tirar, ou manter com o aviso.
- Commitar as mudanças pendentes e atualizar a linha S2 do BACKLOG.

**P1, Onda 1 restante e uso**
- **O1, guardar resultados:** o servidor Python do pacote calcula o hash da entrada do `mdsim` e guarda a saída numa pasta do usuário. Repetir um caso passa a levar segundos. Depende do P0, para o mesmo hash dar o mesmo resultado em qualquer máquina.
- **O4:** mostrar o AVC no N inicial, no N de projeto e no N máximo do giratório, e com 35/50/75 golpes no Marshall, lendo da curva que já é gravada.
- Traduzir os textos novos para EN.
- **O6, guardar a mistura solta:** no giratório Ø150 corta 521 s (52 %) sempre que só a compactação mudar. O resultado é equivalente, não idêntico, então precisa da calibração reduzida.

**P2, encurtar a simulação (precisa de calibração)**
- S2k (coluna inicial mais densa: hoje parte de 822 mm), S2l (queda mais curta), S6a (passo de tempo 2× com escala de inércia) e S6g (menos giros simulados).
- Validar no Marshall com a calibração reduzida: 12 rodadas no vid1, com as grades `calib_red_pb*.json`.
- **A13, calibração do giratório:** está com o usuário, que vai procurar modelos e dados para calibrar (curvas altura × giro, de laboratório ou da literatura). Até lá, nenhuma mudança no giratório depende de calibração.

**P3, backlog**
- M14: pelo núcleo C, o golden falha na parede radial.
- A14: no [W], o topo fica com mais vazios que a base.
- F4: a versão EN usa vírgula decimal.
- F5, F6 e F8.
- M7, M12 e M13: KPIs que não discriminam, KPIs sem teste de mutação e limites ainda iniciais.
- S5: WebAssembly no navegador.

## 5. Passos sugeridos

| # | Quem | Passo | Pronto quando |
|---|---|---|---|
| 1 | você (vid1) | `gh auth login` | `gh pr list` funciona |
| 2 | Claude (vid1) | P0: `-ffp-contract=off` nos builds, exemplos recalculados, protocolo corrigido, commit e push | `main` atualizado; nativo e v2 iguais nos 5 casos de `stress/cref` |
| 3 | você (PC) | `pacote\construir_no_pc.bat` | `MarshallSimulator_1.1.0a2.zip` com o EXE |
| 4 | você (PC) | Abrir o EXE: um exemplo, o [W] 250 g, o Marshall 1200 g, salvar e abrir resultado; anotar os tempos | tudo abre e o AVC reaberto é igual ao gravado |
| 5 | Claude (vid1) | Publicar a release prévia `v1.1.0a2` com o zip | release no GitHub |
| 6 | colegas | Rodada de testes com o `TEST_PROTOCOL.md` | fichas preenchidas, com os tempos por PC e o T7 do laboratório |
| 7 | Claude (vid1) | P1: O1, O4 e as traduções; depois a O6 com a calibração reduzida | testes T2 e T6 abrindo em segundos |
| 8 | Claude (vid1) | P2 com os tempos reais do passo 6 e a A13 com os dados do T7 | Marshall com MAE ≤ 0,5 pp; giratório calibrado |

## 6. Como continuar num chat novo

**Estado em 2026-11-10:** o P0 **não foi executado**. Uma sessão chegou a começar, foi parada a pedido do usuário, e as edições de código dela foram desfeitas. O repositório está como na seção 1, com estes arquivos sem commit:
- `pacote/TEST_PROTOCOL.md`;
- `pacote/build_pacote.py`, com a linha que põe o protocolo no zip;
- `melhorias/HANDOFF.md`;
- este arquivo.

Restos fora do repositório, que podem ser apagados: `~/workspace/s2_fp`. As entradas gravadas para as provas do núcleo C ficam em `~/workspace/s2_bin/casos`.

**Como abrir:**
1. Abra o chat na pasta `/home/sergio/workspace/3dpave_repo`, para o `CLAUDE.md` carregar sozinho.
2. Escolha um único bloco por chat, normalmente o próximo passo da seção 5.
3. Cole uma das mensagens abaixo.

Para só revisar o plano, sem rodar nada:

```
Leia melhorias/RESUMO_E_PROXIMOS_PASSOS.md e me diga o que falta, sem rodar nem alterar nada.
```

Para executar o P0, quando decidir:

```
Leia CLAUDE.md e melhorias/RESUMO_E_PROXIMOS_PASSOS.md e faça só o P0 da seção 4, um commit por item. Antes de cada execução longa (exemplos, golden), me diga o tempo estimado e espere meu OK.
```

**Giratório:** fica fora dos próximos chats até o usuário trazer os modelos e dados de calibração (A13). Quando trouxer, abra um chat só para isso, com os arquivos na pasta `melhorias/` e esta mensagem:

```
Leia CLAUDE.md, a linha A13 do BACKLOG e os dados em melhorias/<arquivo>; proponha a grade de calibração do giratório antes de rodar.
```

Para economizar tokens, faça cada passo do Claude num chat novo, aberto em `/home/sergio/workspace/3dpave_repo` e começando por "leia `melhorias/RESUMO_E_PROXIMOS_PASSOS.md`".
