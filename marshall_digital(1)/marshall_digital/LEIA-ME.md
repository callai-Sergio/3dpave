# Marshall digital

Este pacote gera um corpo de prova Marshall virtual a partir de uma mistura asfáltica. Ele segue o método de Awuah, Garcia-Hernandez & Valentin (2024), *Construction and Building Materials* 416, 135281.

Você informa a granulometria, o teor de betume, os vazios e as dimensões. O programa então:

1. calcula massas e volumes;
2. gera os agregados maiores que 2 mm com a forma da Tabela 3 do paper;
3. despeja os agregados no molde e compacta (simulação física);
4. preenche o restante com mastique e vazios de ar;
5. exporta STL, uma pilha TIFF de fases e um visualizador 3D.

## Opção 1: Google Colab (sem instalar nada)

1. Acesse https://colab.research.google.com e entre com uma conta Google.
2. Use **Arquivo → Fazer upload de notebook** e escolha `Marshall_digital_Colab.ipynb`.
3. Edite a célula **Mistura** (granulometria, betume, vazios…).
4. Use **Ambiente de execução → Executar tudo**.
5. No fim, o navegador baixa o visualizador e o pacote STL.

## Opção 2: no próprio Windows

1. Instale o Python 3.11 ou mais novo em https://www.python.org/downloads/. No instalador, marque **"Add python.exe to PATH"**.
2. Descompacte esta pasta. Dentro dela, clique com o botão direito num espaço vazio e escolha **Abrir no Terminal**.
3. Instale as bibliotecas (uma vez só):
   ```
   pip install numpy scipy scikit-image pillow ziglang
   ```
   O `ziglang` é o compilador C usado pela simulação física. Você não precisa configurar nada.
4. Faça um teste rápido (~5 min), uma porção de 250 g como a do paper:
   ```
   python run.py config_V5_250g_teste.json
   ```
5. Rode o corpo de prova completo (~20–30 min):
   ```
   python run.py config_V5.json
   ```
6. Abra `resultado_V5\V5_visualizador.html` no Chrome ou no Edge. O visualizador precisa de internet só para baixar a biblioteca 3D.

No macOS ou no Linux os passos são os mesmos, usando `python3`.

## Como criar a sua mistura

Copie `config_V5.json` com outro nome, por exemplo `config_minha.json`, e altere os campos abaixo.

| Campo | O que é |
|---|---|
| `nome` | Nome curto, usado nos arquivos de saída |
| `granulometria` | Peneiras (mm) e % passante. Entram na simulação apenas os agregados acima de 2 mm; o que passa em 2 mm vira mastique. |
| `teor_betume_pct` | % de betume na massa total da mistura |
| `densidade_agregado`, `densidade_betume` | Em Mg/m³ |
| `vazios_alvo_pct` | Volume de vazios de ar (AVC) desejado |
| `corpo_de_prova` | Diâmetro e altura (mm). O Marshall padrão é 101,6 × 63,5. |
| `forma_agregados.classes` | Distribuição de Weibull do aspect ratio (escala e forma) e espessura relativa `h`, por faixa de tamanho |
| `calibracao_tamanho` | `"NA_250g"` ajusta o tamanho das partículas a um número de agregados por 250 g. `"fator"` usa Min Feret = fator × abertura da peneira. |
| `simulacao.semente` | Troque o número para gerar outro arranjo aleatório da mesma mistura |
| `propriedades_medidas` | Opcional. Aparecem ao lado da previsão no visualizador. |

**Limite do modelo:** a Eq. (3) foi calibrada pelos autores para calcário, betume 40/60 e tamanho máximo de 10 mm. Para misturas muito diferentes, o próprio paper mostra erro médio de ~22%. A geometria virtual continua válida; a previsão das propriedades é que perde confiabilidade.

## Saídas (pasta `resultado_<nome>`)

- `<nome>_visualizador.html`: modelo 3D. Arraste para girar, use a roda do mouse para zoom e o botão direito para mover a vista. Também tem cortes, seções e a calculadora da Eq. (3).
- `<nome>_STL.zip`:
  - agregados (malha exata de cada partícula);
  - vazios (0,5 mm);
  - mastique (1 mm);
  - envelope do corpo de prova;
  - TIFF de fases: 0 = fora, 1 = mastique, 2 = vazio, 3 = agregado.
- `<nome>_resultados.json`: volumes, número de agregados, película de mastique e previsões da Eq. (3).

## Arquivos do pacote

- `md_core.py`: todas as etapas
- `dem.c`: simulação física (aglomerados de esferas, contato com atrito); compilada automaticamente
- `viewer_template.html`: modelo do visualizador
- `run.py`: ponto de entrada
