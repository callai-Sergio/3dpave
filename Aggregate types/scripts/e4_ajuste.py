"""Etapa 3: ajusta o modelo de forma por classe de tamanho e calibra o gerador do md_core.

Para cada conjunto de dados (config 'ajuste.conjuntos'):
 1. ajuste direto: AR ~ Weibull(escala, forma), Min Feret ~ Weibull, h = mediana(S/I), com IC por bootstrap;
 2. calibração (opcional): evolução diferencial sobre (AR_escala, AR_forma, h, angulosidade) para que as
    formas geradas por md_core._forma, medidas do mesmo jeito que as reais, tenham as mesmas
    distribuições de AR, h e preenchimento da caixa (soma das estatísticas KS);
 3. grava 03_modelo/<conjunto>/forma_agregados.json, config_V5_<conjunto>.json e relatorio.md.
"""
import copy, json, os
import numpy as np
from scipy import stats
from scipy.optimize import differential_evolution
from comum import DESCR, MODELO, caminho, carregar_config, ler_csv, log, n_processos

LIM = [(0.40, 1.0), (4.0, 25.0), (0.42, 0.95), (0.0, 1.0)]  # AR_escala, AR_forma, h, angulosidade
# AR_forma >= 4: uma Weibull mais larga acumula partículas no corte AR = 0,40 de md_core._forma (pico falso).


def selecionar(linhas, filtro, d_min):
    ok = lambda r: any(r['fonte'] == f['fonte'] and r['grupo'] == f.get('grupo', r['grupo']) for f in filtro)
    sel = [r for r in linhas if not r.get('erro') and r['toca_borda'] != 'True' and ok(r)]
    sel = [r for r in sel if float(r['d_peneira_mm']) >= d_min]
    return {k: np.array([float(r[k]) for r in sel]) for k in ('d_peneira_mm', 'AR', 'h', 'preenchimento_caixa',
                                                              'esfericidade', 'convexidade')}


def classes(d, limites, n_min):
    """Atribui classe por d_peneira e funde classes com poucas partículas na vizinha."""
    lim = list(limites)
    while True:
        k = np.searchsorted(lim, d, side='left'); k = np.minimum(k, len(lim)-1)
        n = np.bincount(k, minlength=len(lim))
        ruins = [i for i in range(len(lim)) if n[i] < n_min]
        if not ruins or len(lim) == 1: return lim, k
        i = ruins[0]
        lim.pop(i if i < len(lim)-1 else i-1)  # funde com a classe seguinte (ou a anterior, se for a última)


def weibull(x, nb=0, rng=None):
    c, _, s = stats.weibull_min.fit(x, floc=0)
    out = dict(escala=float(s), forma=float(c), ks=float(stats.kstest(x, 'weibull_min', (c, 0, s)).statistic))
    if nb:
        bs = np.array([stats.weibull_min.fit(rng.choice(x, len(x)), floc=0)[::2] for _ in range(nb)])
        out['IC95_forma'] = np.percentile(bs[:, 0], [2.5, 97.5]).round(3).tolist()
        out['IC95_escala'] = np.percentile(bs[:, 1], [2.5, 97.5]).round(4).tolist()
    return out


def medir_formas(T):
    m = []
    for t in T:
        e = np.sort(t['verts'].max(0) - t['verts'].min(0))[::-1]
        m.append((e[1]/e[0], e[2]/e[1], t['vol']/np.prod(e)))
    return np.array(m).T  # AR, h, preenchimento


class Objetivo:
    """Distância KS entre formas geradas e reais (picklável para os workers do DE)."""

    def __init__(self, md_core_path, reais, n, ngrid, semente):
        self.p, self.reais, self.n, self.ngrid, self.semente = md_core_path, reais, n, ngrid, semente

    def gerar(self, x):
        import sys
        sys.path.insert(0, os.path.dirname(self.p)); import md_core
        rng = np.random.default_rng(self.semente)  # números aleatórios comuns: objetivo determinístico
        par = dict(AR_escala=x[0], AR_forma=x[1], h=x[2])
        return [md_core._forma(rng, par, x[3], self.ngrid) for _ in range(self.n)]

    def __call__(self, x):
        try:
            g = medir_formas(self.gerar(x))
        except Exception:
            return 3.0
        return float(sum(stats.ks_2samp(a, b).statistic for a, b in zip(g, self.reais)))


def grafico(fn, nome, res):
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    fig, axs = plt.subplots(1, len(res), figsize=(4.2*len(res), 3.4), squeeze=False)
    xs = np.linspace(0.2, 1.0, 300)
    for ax, r in zip(axs[0], res):
        ax.hist(r['_AR'], 25, range=(0.2, 1), density=True, color='0.75', label=f'medido (n={r["n"]})')
        a = r['ajuste_direto']['AR']
        ax.plot(xs, stats.weibull_min.pdf(xs, a['forma'], 0, a['escala']), 'C0', label='Weibull ajustada')
        if r.get('_base'):
            b = r['_base']; ax.plot(xs, stats.weibull_min.pdf(xs, b['AR_forma'], 0, b['AR_escala']), 'C3--',
                                     label='config atual')
        if r.get('_AR_gerado') is not None:
            ax.hist(r['_AR_gerado'], 25, range=(0.2, 1), density=True, histtype='step', color='C2', lw=1.5,
                    label='gerador calibrado')
        ax.set_title(f'{nome}: até {r["ate_mm"]:g} mm'); ax.set_xlabel('AR = I/L'); ax.legend(fontsize=7)
    fig.tight_layout(); fig.savefig(fn, dpi=110); plt.close(fig)


def rodar(cfg):
    aj = cfg['ajuste']; rng = np.random.default_rng(1)
    linhas = ler_csv(os.path.join(DESCR, 'descritores.csv'))
    base = carregar_config(caminho(cfg['config_base_marshall']))
    cls_base = base['forma_agregados']['classes']
    for nome, filtro in aj['conjuntos'].items():
        X = selecionar(linhas, filtro, aj['d_min_mm'])
        n = len(X['AR'])
        if n < aj['n_min_classe']:
            log(f'Ajuste {nome}: só {n} partículas válidas, pulado'); continue
        lim, k = classes(X['d_peneira_mm'], aj['classes_ate_mm'], aj['n_min_classe'])
        log(f'Ajuste {nome}: {n} partículas; classes até {lim} mm; n = {np.bincount(k).tolist()}')
        pasta = os.path.join(MODELO, nome); os.makedirs(pasta, exist_ok=True)
        res = []
        for i, ate in enumerate(lim):
            s = k == i
            ARi, hi_, fi = X['AR'][s], X['h'][s], X['preenchimento_caixa'][s]
            pb = next((c for c in cls_base if ate <= c['ate_mm']), cls_base[-1])
            r = dict(ate_mm=ate, n=int(s.sum()), _AR=ARi, _base=pb,
                     ajuste_direto=dict(AR=weibull(ARi, aj['bootstrap'], rng),
                                        min_feret_mm=weibull(X['d_peneira_mm'][s], aj['bootstrap'], rng),
                                        h_mediana=float(np.median(hi_)), h_cv=float(hi_.std()/hi_.mean()),
                                        preenchimento_mediana=float(np.median(fi)),
                                        esfericidade_mediana=float(np.median(X['esfericidade'][s])),
                                        convexidade_mediana=float(np.median(X['convexidade'][s]))),
                     ks_config_atual=float(stats.kstest(ARi, 'weibull_min', (pb['AR_forma'], 0, pb['AR_escala'])).statistic))
            a = r['ajuste_direto']['AR']
            r['param'] = dict(AR_escala=a['escala'], AR_forma=a['forma'], h=r['ajuste_direto']['h_mediana'])
            if aj['calibrar_gerador']:
                cc = aj['calibracao']
                lims = [tuple(l) for l in cc.get('limites', LIM)]
                obj = Objetivo(caminho(cfg['md_core']), (ARi, hi_, fi), cc['n_formas'], cc['ngrid'], cc['semente'])
                x0 = np.clip([a['escala'], a['forma'], r['param']['h'], 0.28], [l[0] for l in lims], [l[1] for l in lims])
                log(f'  classe até {ate:g} mm: calibrando gerador (n={r["n"]}, perda inicial {obj(x0):.3f})')
                de = differential_evolution(obj, lims, x0=x0, maxiter=cc['maxiter'], popsize=cc['popsize'],
                                            seed=cc['semente'], workers=n_processos(cfg), updating='deferred',
                                            polish=False, tol=1e-3)
                g = medir_formas(obj.gerar(de.x))
                r['param'] = dict(AR_escala=float(de.x[0]), AR_forma=float(de.x[1]), h=float(de.x[2]))
                r['angulosidade'] = float(de.x[3]); r['_AR_gerado'] = g[0]
                r['calibracao'] = dict(perda_inicial=obj(x0), perda_final=float(de.fun), n_aval=int(de.nfev),
                                       ks_AR=float(stats.ks_2samp(g[0], ARi).statistic),
                                       ks_h=float(stats.ks_2samp(g[1], hi_).statistic),
                                       ks_preenchimento=float(stats.ks_2samp(g[2], fi).statistic))
                # referência: o gerador com os parâmetros atuais do config, medido do mesmo jeito
                r['calibracao']['perda_config_atual'] = obj([pb['AR_escala'], pb['AR_forma'], pb['h'],
                                                            base['forma_agregados'].get('angulosidade', 0.28)])
                log(f'    perda {r["calibracao"]["perda_inicial"]:.3f} -> {de.fun:.3f} '
                    f'(config atual {r["calibracao"]["perda_config_atual"]:.3f}); ang = {de.x[3]:.3f}')
            res.append(r)

        w = np.array([r['n'] for r in res], float)
        ang = float(np.average([r.get('angulosidade', base['forma_agregados'].get('angulosidade', 0.28)) for r in res], weights=w))
        forma = {
            '_comentario': f'Ajustado em dados reais ({nome}: {filtro}) por Aggregate types/scripts/e4_ajuste.py. '
                           'AR ~ Weibull(escala, forma); h = espessura/Min Feret. Extras (n, IC, KS) são ignorados por md_core.',
            'classes': [dict(ate_mm=(999 if i == len(res)-1 else r['ate_mm']),
                             AR_escala=round(r['param']['AR_escala'], 4), AR_forma=round(r['param']['AR_forma'], 3),
                             h=round(r['param']['h'], 3), n=r['n'],
                             MF_escala=round(r['ajuste_direto']['min_feret_mm']['escala'], 3),
                             MF_forma=round(r['ajuste_direto']['min_feret_mm']['forma'], 3),
                             angulosidade_classe=round(r.get('angulosidade', ang), 3)) for i, r in enumerate(res)],
            'angulosidade': round(ang, 3),
        }
        with open(os.path.join(pasta, 'forma_agregados.json'), 'w', encoding='utf-8') as f:
            json.dump(forma, f, indent=1, ensure_ascii=False)
        nb = copy.deepcopy(base); nb['forma_agregados'] = forma; nb['nome'] = f'{base.get("nome", "V5")}_{nome}'
        with open(os.path.join(pasta, f'config_V5_{nome}.json'), 'w', encoding='utf-8') as f:
            json.dump(nb, f, indent=1, ensure_ascii=False)
        limpo = [{k: v for k, v in r.items() if not k.startswith('_')} for r in res]
        with open(os.path.join(pasta, 'ajuste_detalhado.json'), 'w', encoding='utf-8') as f:
            json.dump(limpo, f, indent=1, ensure_ascii=False)
        grafico(os.path.join(pasta, 'AR_por_classe.png'), nome, res)
        relatorio(os.path.join(pasta, 'relatorio.md'), nome, filtro, res, forma)
        log(f'  modelo gravado em {pasta}')


def relatorio(fn, nome, filtro, res, forma):
    L = [f'# Modelo de forma: {nome}', '', f'Dados: `{json.dumps(filtro)}`', '',
         '| até (mm) | n | AR escala | AR forma | h | KS AR (novo) | KS AR (config atual) | perda gerador: atual → calibrado |',
         '|---|---|---|---|---|---|---|---|']
    for r, c in zip(res, forma['classes']):
        cal = r.get('calibracao', {})
        pg = f'{cal["perda_config_atual"]:.3f} → {cal["perda_final"]:.3f}' if cal else '—'
        L.append(f'| {c["ate_mm"]:g} | {r["n"]} | {c["AR_escala"]} | {c["AR_forma"]} | {c["h"]} | '
                 f'{r["ajuste_direto"]["AR"]["ks"]:.3f} | {r["ks_config_atual"]:.3f} | {pg} |')
    L += ['', f'Angulosidade global: {forma["angulosidade"]}', '',
          'KS = estatística de Kolmogorov-Smirnov (menor é melhor). A "perda do gerador" soma o KS de AR, h e',
          'preenchimento da caixa entre as formas geradas por md_core._forma e as medidas.', '',
          '![AR por classe](AR_por_classe.png)']
    with open(fn, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')
