# Marshall Simulator: próximos passos (29/10/2026)

## Estado atual
- App: `marshall_digital_app.html` (Wan et al. 2024). Artefato v5 em https://claude.ai/artifact/NZdqVD7NCQUwAA3bTUsTNW. Tem PT/EN e 17 curvas alemãs AC/PA (TL Asphalt-StB 07/13).
- Pacote para os colegas: `pacote/` (marshall-simulator 1.0.0, pywebview). Já foi gerado `pacote/MarshallSimulator_1.0.0.zip`. Testado só no Windows.
- Servidor vid1: o pipeline de agregados está parado e o modelo v2 terminou em 28/10. Os resultados ficam em `~/workspace/3dpave/agregados/03_modelo/{todos,f004_A,sma_diabasio}` e já foram copiados para cá.

## Próximos passos (por prioridade)
1. **Formas reais dos agregados (o maior ganho).** O gerador convexo (`md_core._forma`) dá convexidade de cerca de 0,99, mas os grãos reais ficam entre 0,66 e 0,81.
   - Fazer `md_core.agregados()` e o app em HTML sortearem as formas de `03_modelo/<conjunto>/biblioteca_formas_reais.json`. O formato é: envoltórias convexas, I=1, eixos x=L, y=I, z=S, agrupadas por `ate_mm`.
   - No app, acrescentar `sma_diabasio`, `f004_A` e `todos` como bibliotecas de agregado, ao lado de WL/WG.
   - Comparar com a referência: `resultado_V5` vs `resultado_V5_sma_diabasio`. Leito solto 54,2 vs 59,3 mm; pistão 42,5 vs 44,6 N.
2. **Peneiras intermediárias das curvas DE AC/PA.** Hoje têm status 'R' e valores aproximados. É preciso conferi-las com as tabelas oficiais da TL Asphalt-StB 07/13 (FGSV); para isso, pedir uma tabela ou um scan. Depois, atualizar também `gradation_points.csv` em `Granulometrric curves`, que ainda tem status P em branco.
3. **Republicar o artefato** pelo mesmo caminho de arquivo, porque a última mudança de texto ("minhas_curvas.json do Marshall Simulator") ainda não foi publicada. Toda vez que o HTML mudar:
   - copiar o HTML para `pacote/src/marshall_simulator/web/`;
   - rodar `python -m build` dentro de `pacote`;
   - refazer o zip.
4. **Opcionais**
   - Ponto como separador decimal na versão EN.
   - Sugestão de B por curva: a Eq. 3 de [W] não serve para PA, que cai no fallback de 48%.
   - Testar o que ainda não foi testado: 1000 g, o preset [W] completo, o download do zip no artefato e no pywebview, e o pacote no macOS/Linux.

## Lembretes
- Rodar o pesado no vid1. Fazer poucas chamadas SSH e espaçadas, porque conexões rápidas já bloquearam a porta 22 por cerca de 1 h.
- Para saber se o pipeline está rodando: `pgrep -f "[p]ython.*pipeline.py"`.
