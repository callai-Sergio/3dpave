# Pipeline: agregados reais → modelo de forma do Marshall digital

Hoje o gerador de formas (`md_core._forma` e o app HTML) usa parâmetros de artigo: Weibull do AR, `h` e
`angulosidade`, de [A] Tabela 3 e [W] Tabela 2. Este pipeline mede formas reais e devolve esses mesmos
parâmetros, ajustados aos dados, no formato que o `config_V5.json` já usa.

```
00_bruto ──stl/ct──▶ 01_limpo ──descritores──▶ 02_descritores ──ajuste──▶ 03_modelo
 STL F004            uma malha .ply             descritores.csv            forma_agregados.json
 micro-CT F001       por partícula              (L, I, S, AR, h,           config_V5_<conjunto>.json
                     + QA (PNG)                  Feret, esfericidade…)     biblioteca_formas_reais.json
                                                                           relatorio.md + gráficos
```

| Etapa | O que faz | Custo |
|---|---|---|
| `stl` | limpa as 52 + 15 malhas do F004 (mm, estanques) | segundos |
| `ct` | segmenta os agregados da micro-CT do SMA 11 S: binning → ROI cilíndrica → limiar Otsu → watershed → marching cubes. Partículas cortadas pela borda ficam marcadas e saem do ajuste. | **pesado**: 30–90 min, 25–30 GB de RAM com binning 2 |
| `descritores` | eixos principais L ≥ I ≥ S, **AR = I/L**, **h = S/I** (a convenção de `_forma`), Feret 3D, esfericidade, convexidade, preenchimento da caixa | minutos, paralelo |
| `ajuste` | por classe de tamanho: Weibull do AR e do Min Feret (IC por bootstrap); depois **calibra o gerador** por evolução diferencial: procura (AR_escala, AR_forma, h, angulosidade) até que as formas geradas por `md_core._forma` tenham as mesmas distribuições de AR, h e preenchimento das reais (soma de KS) | 5–30 min, paralelo |
| `biblioteca` | formas reais normalizadas (I = 1, convexas, ≤ 48 vértices) para trocar a biblioteca de [W] no app | segundos |

Conjuntos ajustados (em `config_pipeline.json` → `ajuste.conjuntos`): `sma_diabasio` (CT do F001, o mais
próximo de mistura asfáltica), `f004_A` (agregado de concreto) e `todos`.

## 1. Enviar para o servidor

Envie os `.tar.gz` (14 GB), e não os TIFF já extraídos (22 GB). No PowerShell, troque `usuario@servidor`:

```powershell
cd "H:\data\callai\workspace\3dpave"
ssh usuario@servidor "mkdir -p ~/3dpave/Aggregate\ types/00_bruto ~/3dpave/marshall_digital(1)"
scp -r "Aggregate types\scripts" "Aggregate types\srtuttugart" usuario@servidor:"~/3dpave/Aggregate types/"
scp -r "Aggregate types\00_bruto\F004" usuario@servidor:"~/3dpave/Aggregate types/00_bruto/"
scp -r "marshall_digital(1)\marshall_digital" usuario@servidor:"~/3dpave/marshall_digital(1)/"
```

O pipeline precisa de `marshall_digital/md_core.py` e `config_V5.json` na mesma posição relativa (`../marshall_digital(1)/...`).

## 2. Rodar

```bash
cd ~/3dpave/"Aggregate types"
bash scripts/rodar_servidor.sh --amostra      # 1º: teste da segmentação num pedaço (≈300 fatias)
```

Confira `01_limpo/F001/20200429_antes_amostra/`:
- `histograma.png`: a linha vermelha (limiar do agregado) tem de ficar no vale entre mastique e agregado.
  Se não ficar, troque `metodo_limiar` para `"otsu2"` ou fixe `limiar_agregado` com um número.
- `qa_fatia_*.png`: contornos vermelhos em volta de cada agregado. Agregados partidos em vários pedaços
  → aumente `ws_dist_min_mm`; agregados vizinhos colados → diminua.

Depois, a rodada completa:

```bash
bash scripts/rodar_servidor.sh                # tudo; o log fica em 03_modelo/logs/
tail -f 03_modelo/logs/pipeline_*.log
```

Pouca RAM (< 32 GB): use `"binning": 3` (voxel 0,09 mm; um agregado de 2 mm ainda tem ~22 voxels).
Para refazer só o ajuste depois de mexer no config: `bash scripts/rodar_servidor.sh --etapas ajuste biblioteca`.

## 3. Trazer o resultado

Só `03_modelo` (poucos MB):

```powershell
scp -r usuario@servidor:"~/3dpave/Aggregate types/03_modelo" "H:\data\callai\workspace\3dpave\Aggregate types\"
```

- `03_modelo/sma_diabasio/config_V5_sma_diabasio.json`: roda direto com `python run.py <arquivo>`.
- `forma_agregados.json`: bloco para colar em qualquer config.
- `relatorio.md`: KS do modelo novo vs config atual, por classe. É a medida de quanto o modelo melhorou.
- `biblioteca_formas_reais.json`: para o app HTML (seção 1 da especificação: a biblioteca de formas é trocável).

## Cuidados

- A pasta local `00_bruto/F003` contém na verdade os arquivos do **F001** (amostra 2-1). No servidor eles são
  extraídos em `00_bruto/F001`.
- Os dois scans do F001 são o **mesmo corpo de prova** antes e depois da compressão. Só o "antes" entra no
  ajuste, para não contar as mesmas partículas duas vezes.
- F004 é agregado de concreto (9–53 mm), maior que a faixa da mistura. Use-o para a forma (AR, h), não para os
  tamanhos. Os grupos A e B podem ser as mesmas pedras (A simplificado e reescalado): por isso só A entra.
- Os STL do F004 não declaram unidade. As extensões (9–53 mm) indicam mm.
