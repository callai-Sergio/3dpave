# Marshall Simulator

Corpo de prova Marshall virtual pelo método de Wan et al. (2024), *Algorithms to create realistic virtual asphalt mixtures*, Computers and Structures 298, 107391, com compactação Marshall e giratória por DEM. Interface em português ou inglês.

© 2026 Sergio Callai. Versão alfa, para teste.

## Instalação

**Windows, sem Python:** abra `MarshallSimulator.exe`. Na primeira vez o Windows pode avisar que o programa não é assinado: clique em "Mais informações" e "Executar assim mesmo".

**Com Python 3.9 ou mais novo (Windows, Linux, macOS):**

```
pip install marshall_simulator-1.1.0a1-py3-none-any.whl
```

## Uso

```
marshall-simulator
```

ou `python -m marshall_simulator`. O programa abre numa janela própria. No Windows, essa janela usa o WebView2, que já vem no Windows 10 e 11.

- Funciona sem internet: o three.js (a biblioteca 3D) vem junto. Sem internet, as fontes da interface viram as do sistema.
- As curvas criadas em "Adicionar curva" ficam em `~/.marshall_simulator/minhas_curvas.json`. A pasta muda com a variável `MARSHALL_SIM_DIR`.
- Opção `--browser`: abre no navegador padrão em vez da janela.
- O motor roda dentro da janela, em JavaScript. O CP rápido de 250 g leva 2–4 min; Marshall (1200 g) e giratório em tamanho real, de 10 min a mais de 1 h.

## Avisos

- Os padrões de Avançado (película λ 0,55 e escala de energia 0,002) foram calibrados com os dados de Albayati (2024), betume 60/70, Marshall com 75 golpes: erro médio de 0,3 pp no AVC (média de 3 CPs). Outros ligantes, granulometrias e o giratório ainda não foram calibrados.
- Um CP isolado pode variar ~1 pp de AVC com a semente; compare médias de vários CPs.
- As peneiras intermediárias das faixas AC/PA da TL Asphalt-StB 07/13 são aproximadas (status R): confira-as na norma. Os valores K também ainda precisam ser conferidos.

## Montar o pacote

Na raiz do repositório, `node build.mjs`; depois, nesta pasta, `python build_pacote.py --exe`. O three.js r128 (MIT, `vendor/`) é copiado para dentro do pacote.
