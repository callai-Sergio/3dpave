"""Etapa 4: biblioteca de formas reais para o app (troca a biblioteca de [W] Tabela 2).

Para cada conjunto e classe, sorteia até 'formas_por_classe' partículas válidas, gira para os eixos
principais, escala para Min Feret (I) = 1 e simplifica para um poliedro convexo de até 'max_vertices'
vértices (o app usa formas convexas no teste de voxel e no aglomerado de esferas).
Saída: 03_modelo/<conjunto>/biblioteca_formas_reais.json
"""
import json, os
import numpy as np
from scipy.spatial import ConvexHull
from comum import DESCR, LIMPO, MODELO, eixos_principais, ler_csv, log


def fps(p, k, rng):
    """Amostragem do ponto mais distante: preserva cantos e arestas do fecho."""
    if len(p) <= k: return p
    i = [int(rng.integers(len(p)))]; d = np.linalg.norm(p - p[i[0]], axis=1)
    for _ in range(k-1):
        j = int(np.argmax(d)); i.append(j); d = np.minimum(d, np.linalg.norm(p - p[j], axis=1))
    return p[i]


def forma_normalizada(fn, kmax, rng):
    import trimesh
    m = trimesh.load(fn, force='mesh')
    c, Q = eixos_principais(m.vertices, m.faces)
    p = (m.vertices - c) @ Q
    o = np.argsort(p.max(0) - p.min(0))[::-1]; p = p[:, o]          # x = L, y = I, z = S
    if np.linalg.det(Q[:, o]) < 0: p[:, 2] *= -1
    p = p[ConvexHull(p).vertices]; p = fps(p, kmax, rng)
    h = ConvexHull(p); v = p[h.vertices]; h = ConvexHull(v)
    I = v[:, 1].max() - v[:, 1].min(); v = v/I
    f = h.simplices.copy(); cen = v[f].mean(1)
    n = np.cross(v[f[:, 1]]-v[f[:, 0]], v[f[:, 2]]-v[f[:, 0]])
    flip = (n*(cen - v.mean(0))).sum(1) < 0; f[flip] = f[flip][:, ::-1]
    return dict(verts=np.round(v, 5).tolist(), faces=f.tolist(), vol=float(h.volume),
                volume_real_sobre_fecho=None)


def rodar(cfg):
    bb = cfg['biblioteca']; rng = np.random.default_rng(7)
    linhas = [r for r in ler_csv(os.path.join(DESCR, 'descritores.csv')) if not r.get('erro')]
    for nome, filtro in cfg['ajuste']['conjuntos'].items():
        fm = os.path.join(MODELO, nome, 'forma_agregados.json')
        if not os.path.exists(fm): continue
        with open(fm, encoding='utf-8') as f:
            cls = json.load(f)['classes']
        ok = lambda r: any(r['fonte'] == x['fonte'] and r['grupo'] == x.get('grupo', r['grupo']) for x in filtro)
        sel = [r for r in linhas if ok(r) and r['toca_borda'] != 'True'
               and float(r['d_peneira_mm']) >= cfg['ajuste']['d_min_mm']]
        lib = {'_comentario': 'Formas reais normalizadas (Min Feret I = 1; eixos x=L, y=I, z=S). '
                              'Gerado por Aggregate types/scripts/e5_biblioteca.py.', 'classes': []}
        lo = 0
        for c in cls:
            rs = [r for r in sel if lo < float(r['d_peneira_mm']) <= c['ate_mm']]
            rs = [rs[i] for i in rng.permutation(len(rs))[:bb['formas_por_classe']]]
            formas = []
            for r in rs:
                d = forma_normalizada(os.path.join(LIMPO, r['arquivo']), bb['max_vertices'], rng)
                d.update(id=f'{r["fonte"]}/{r["grupo"]}/{r["particula"]}', min_feret_mm=float(r['I_mm']),
                         AR=float(r['AR']), h=float(r['h']), volume_real_sobre_fecho=float(r['convexidade']))
                formas.append(d)
            lib['classes'].append(dict(ate_mm=c['ate_mm'], formas=formas)); lo = c['ate_mm']
            log(f'Biblioteca {nome}: até {c["ate_mm"]:g} mm -> {len(formas)} formas')
        with open(os.path.join(MODELO, nome, 'biblioteca_formas_reais.json'), 'w', encoding='utf-8') as f:
            json.dump(lib, f, separators=(',', ':'))
