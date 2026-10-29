# Marshall Simulator

Corpo de prova Marshall virtual pelo método de Wan et al. (2024), *Algorithms to create realistic virtual asphalt mixtures*, Computers and Structures 298, 107391. Interface em português ou inglês.

## Instalação

Precisa de Python 3.9 ou mais novo.

```
pip install marshall_simulator-1.0.0-py3-none-any.whl
```

## Uso

```
marshall-simulator
```

ou `python -m marshall_simulator`. O programa abre numa janela própria. No Windows, essa janela usa o WebView2, que já vem no Windows 10 e 11.

- Na primeira abertura, o three.js (a biblioteca 3D) é carregado da internet.
- As curvas criadas em "Adicionar curva" ficam em `~/.marshall_simulator/minhas_curvas.json`. A pasta muda com a variável `MARSHALL_SIM_DIR`.
- Opção `--browser`: abre no navegador padrão em vez da janela.

## Avisos

As peneiras intermediárias das faixas AC/PA da TL Asphalt-StB 07/13 são aproximadas (status R): confira-as na norma. Os valores K também ainda precisam ser conferidos.
