# Instruções para o chat que vai implementar as melhorias do Marshall Digital

Cole este arquivo (ou aponte para ele) no início do novo chat. Ele vale para a pasta do projeto `H:\data\callai\workspace\3dpave`.

## 1. Objetivo

Juntar numa lista só todas as melhorias propostas pelos diferentes chats de avaliação, tirar duplicatas e resolver conflitos. Depois implementar uma por vez no app `marshall_digital_app.html` e no harness `stress/`, provando cada uma pelos KPIs.

## 2. O que ler primeiro (nesta ordem)

1. **`Marshall_digital_especificacao.md`:** a especificação do app e as referências ([W] = Wan et al. 2024).
2. **`Marshall_digital_stress_test.md`:** definição dos KPIs K1–K26, desenho da triagem e §5 (recalibrar os limites depois da triagem).
3. **`stress/README.md`:** como o harness funciona e os comandos.
4. **`plano_melhorias_marshall_digital.md`:** problemas P1–P7, problemas de medição M1–M10, metas de KPI (existentes e novos, K16b e K27–K32) e melhorias 1–13 por prioridade.
5. **Avaliações dos outros chats:** todos os arquivos em `melhorias/`. O usuário salva ali o resultado de cada chat de avaliação, um arquivo por chat. Se a pasta não existir ou estiver vazia, pergunte ao usuário onde estão antes de começar.
6. **Resultados da triagem:** `stress/results_vid1/` (99 casos, vindos do servidor), com `screening.jsonl`, `screening.report.txt`, `screening.effects.txt` e `screening.csv`.

## 3. Números finais da triagem (99 casos, 2026-10-28)

O plano foi escrito com 78 casos; estes são os números finais.

- **Categorias:** 78 D, 9 C, 12 warn e 0 pass. Não houve crash, hang nem OOM. Das 33 células, 28 quebram.
- **Quebras por KPI:**

| KPI | Quebras |
|---|---|
| K16 | 53 |
| K3 | 22 |
| K19 | 15 |
| K5 | 12 |
| K6 | 12 |
| K15 | 11 |
| K8 | 3 |
| K2, K9, K14 | 1 cada |

- **Flags:** `placeFail` em 41 casos, `bubbleDeficit` em 12.
- **K3 (mastique):** quebra em 21 de 48 casos com p2 = 20 e em 0 de 48 com p2 = 58.
- **Vazios por terço (inferior / meio / superior):** AVC 12 % → 8,4 / 18,1 / 9,6 %; AVC 2 % → 1,4 / 2,8 / 1,8 %. O perfil vertical está invertido em relação ao CP real (P1).
- **Taxa de quebra:** fica entre 39 e 45 de 48 casos em qualquer nível de fator. Leia os efeitos nos KPIs contínuos, não em "broke".

## 4. Como trabalhar

1. **Consolidar o backlog primeiro.**
   - Monte `melhorias/BACKLOG.md` com uma linha por melhoria: ID, origem (qual chat ou documento), problema, mudança proposta, arquivo e linha, KPI que prova, meta, prioridade e status.
   - Junte duplicatas e anote conflitos entre chats.
   - **Mostre o backlog ao usuário e espere o OK antes de mudar código.**
2. **Usar git.** Se a pasta não for repositório, rode `git init` e faça um commit do estado atual como base. Use um commit por melhoria, com o ID do backlog na mensagem.
3. **Uma melhoria por vez.** Para cada uma:
   - Medir antes: KPIs alvo nos casos relevantes.
   - Mudar.
   - Medir depois.
   - Atualizar o status no backlog.
4. **Separar as mudanças de medição das mudanças do simulador.**
   - Primeiro as correções do harness (M1–M5, K16b, K27–K31 em `stress/kpi.mjs`). Assim as melhorias do simulador são medidas com a régua certa.
   - Depois as do app, na ordem de prioridade.
5. **Validação mínima depois de cada mudança no app:**
   - `node stress/golden.mjs --determinism` deve passar e dar `identical`.
   - `node stress/run.mjs stress/grids/smoke.json --jobs 6` não pode ter crash nem casos inválidos novos.
   - O caso que motivou a mudança deve atingir a meta do KPI.
6. **Ao fim de um bloco de melhorias:** rodar de novo a triagem (ou uma Fase 2 focada: p2 × AVC × bolhas, 250 g, 5 sementes) e comparar com `stress/results_vid1/` antes/depois.

## 5. Regras e armadilhas

- **Instrumentação do harness.** `stress/engine.mjs` extrai o worker do HTML e aplica patches de texto que precisam casar exatamente uma vez. Se você mudar trechos do app que um patch procura, o harness para com `instrumentation patch "..." matched 0 times`. Atualize o patch em `engine.mjs` junto, mas não mude o que ele mede.
- **O golden é a âncora.**
  - Se uma melhoria muda de propósito um valor de referência (por exemplo o perfil radial de parede), atualize `stress/golden.mjs` no mesmo commit e explique o porquê.
  - Nunca afrouxe o golden só para passar.
  - A tolerância da parede (± 2 pp) já é conhecida como apertada demais (M10).
- **Node 24.11.1.** É a versão do PC. Com Node 22 o golden falha. Mesmo com o mesmo Node, Windows e Linux divergem um pouco (Vagg 51,684 contra 51,678). Compare antes/depois sempre na mesma máquina.
- **Fidelidade a [W].** Algumas causas seguem o paper, por exemplo P1a: "as paredes contam como agregado", [W] §3.6. Quando a correção se afastar de [W], deixe isso explícito no app (texto do "Sobre o método") e no backlog.
- **Idioma.** O app é bilíngue PT/EN, com a tabela `I18N_EN` no HTML. Todo texto novo de interface precisa da tradução.
- **Não tocar:** `/data/callai/workspace/tyron` no servidor, que é outro trabalho.

## 6. Rodar grades longas no servidor vid1

- **Servidor:** `sergio@137.226.169.235` (videolabor-01), 96 núcleos, 125 GB. É compartilhado e costuma ter carga ~80, então use `--jobs 10`.
- **Enviar e rodar:** `bash stress/server/deploy.sh sergio@137.226.169.235` (Git Bash no PC). Ele copia o app e o `stress/` para `/data/callai/workspace/3dpave_stress` e chama `server_run.sh`.
- **Atenção ao `server_run.sh`:** a versão do PC ainda não fixa o Node 24. No vid1 ela foi corrigida à mão para usar `.node/bin/node` (v24.11.1). O deploy sobrescreve essa correção. Antes do próximo deploy, aplique a mesma mudança no `stress/server/server_run.sh` do PC: preferir `.node/bin/node` quando existir, e baixar v24.11.1 em vez de v22.11.0.
- **Acompanhar:** `ssh sergio@137.226.169.235 'bash /data/callai/workspace/3dpave_stress/stress/server/status.sh screening'`.
- **Trazer os resultados:** `bash stress/server/fetch.sh sergio@137.226.169.235` (vão para `stress/results/server/`).
- **Perfil vertical fino:** `analise_perfil_vertical/vprof.mjs` e `analyze.mjs` (no vid1, ao lado do deploy) rodam um caso e dão o perfil por fatia. Bons para medir P1 antes de K31 existir no app.

## 7. Entregáveis

- `melhorias/BACKLOG.md` consolidado, com status atualizado.
- Um commit por melhoria, com golden e smoke passando.
- Tabela final antes/depois dos KPIs alvo (P1–P7, K16b, K27–K30).
- Lista do que ficou de fora e por quê.
