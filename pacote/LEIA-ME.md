# Marshall Simulator 1.1.0 alfa

Corpo de prova asfáltico virtual: agregados reais, compactação [W], Marshall ou giratória, mastique, vazios e bolhas, com exportação em STL.

© 2026 Sergio Callai. Versão alfa, para teste entre colegas; não distribuir.

## Como abrir

- **Windows:** dê dois cliques em `MarshallSimulator.exe`. Se o Windows avisar que o programa não é assinado, clique em "Mais informações" e "Executar assim mesmo".
- **Outros sistemas, com Python 3.9+:** `pip install marshall_simulator-1.1.0a1-py3-none-any.whl` e depois `marshall-simulator`.

Funciona sem internet. A Ajuda e as Referências estão na própria tela.

## O que testar

1. Abra com uma curva da lista e gere o CP rápido (protocolo [W], 250 g, 2–4 min).
2. Rode um Marshall com a sua mistura e compare o AVC previsto com o do laboratório (10–40 min).
3. Gire o 3D, use os cortes e exporte os STL.

Anote o que der errado (mensagem, curva, protocolo, tempo) e mande para o Sergio.

## Limites desta versão

- A calibração do Marshall (λ 0,55, escala de energia 0,002) foi feita com Albayati (2024), betume 60/70: erro médio de 0,3 pp no AVC (média de 3 CPs). Um CP isolado varia ~1 pp com a semente.
- O giratório e outros ligantes ainda não foram calibrados.
- Simulações em tamanho real são lentas no app (até mais de 1 h no giratório).
