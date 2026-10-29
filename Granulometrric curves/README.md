# gradlib – biblioteca de curvas granulométricas (DE / EUA / BR)

Núcleo v1.0 (2026-10-27): 40 curvas e 292 pontos.

| País | Norma | Curvas |
|---|---|---|
| BR | DNIT 031/2024-ES (vigente) | A-25, B-19, C-12,5, D-9,5, mais o limiar de PCP |
| BR | DNIT 031/2006-ES (cancelada) | A, B, C |
| US | AASHTO M 323 (Superpave) | pontos de controle 37,5 / 25 / 19 / 12,5 / 9,5 / 4,75 mm, mais a PCS |
| US | AASHTO M 325 / NCHRP 9-8 (SMA) | 25 / 19 / 12,5 / 9,5 / 4,75 mm |
| DE | TL Asphalt-StB 07/13 | AC T, AC B, AC D, SMA, PA (17 + 5 tipos) |

## Proveniência

Todo ponto tem `status` e `source_id`. A tabela completa de fontes está em `data/sources.csv`.

| Status | Significado |
|---|---|
| V1 | Fonte primária (texto oficial) |
| V2 | Fonte secundária que reproduz a norma |
| K  | Conhecimento prévio; precisa ser conferido |
| P  | Pendente; o valor ainda não foi preenchido |

## Arquivos

- `build_db.py`: fonte única dos dados. Ele gera `data/*.csv` e `data/gradation_library.json`.
- `gradlib.py`: funções para usar a base:
  - `load`
  - `list_curves(min_status=...)`
  - `envelope`
  - `to_wide`
  - `interp` (log ou potência 0,45; útil para converter entre as séries ISO e ASTM)
  - `check` (enquadramento na faixa e classificação grossa/fina)
  - `working_band` (faixa de trabalho DNIT, Tabela 3 com o recorte do Anexo B)
  - `max_density_line`
  - `plot`
- `make_xlsx.py`: gera a planilha `biblioteca_granulometrias.xlsx`.

## Exemplo

```python
import gradlib as g
lib = g.load()
g.list_curves(lib, min_status="V2")          # só curvas sem valores K/P
g.check(lib, "BR_DNIT031-2024_C-12,5", {19:100, 12.5:94.7, 9.5:83.5, 2.36:49.9, 0.075:3.4})
g.plot(lib, ["BR_DNIT031-2024_C-12,5", "US_M323_12.5"], show_mdl=True)
```

## Para completar

1. Alemanha: preencher os pontos P (AC, PA e SMA 11 S em 8 mm) com as Tabelas 4, 6, 7, 8 e 10 da TL Asphalt-StB 07/13. Depois, avaliar a migração para a TL Asphalt-StB 25.
2. EUA: conferir os valores K contra a AASHTO M 323 e a M 325 vigentes:
   - SMA, peneiras superiores e 1,18 mm;
   - Superpave 4,75 mm;
   - PCS da curva de 37,5 mm.
3. BR 2006: conferir as faixas A, B e C com o PDF da DNIT 031/2006-ES.
