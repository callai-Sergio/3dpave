# Modelo de forma: sma_diabasio

Dados: `[{"fonte": "F001", "grupo": "20200429_antes"}]`

| até (mm) | n | AR escala | AR forma | h | KS AR (novo) | KS AR (config atual) | perda gerador: atual → calibrado |
|---|---|---|---|---|---|---|---|
| 4 | 162 | 0.794 | 5.722 | 0.797 | 0.047 | 0.256 | 1.126 → 0.383 |
| 8 | 155 | 0.8721 | 2.168 | 0.735 | 0.054 | 0.116 | 1.308 → 0.525 |
| 999 | 56 | 0.9179 | 5.214 | 0.747 | 0.071 | 0.390 | 1.629 → 0.451 |

Angulosidade global: 0.882

KS = estatística de Kolmogorov-Smirnov (menor é melhor). A "perda do gerador" soma o KS de AR, h e
preenchimento da caixa entre as formas geradas por md_core._forma e as medidas.

![AR por classe](AR_por_classe.png)
