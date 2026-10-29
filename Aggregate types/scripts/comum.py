"""Funções comuns do pipeline de agregados: configuração, caminhos e descritores de forma.

Convenção dos eixos (a mesma de md_core._forma): a malha é girada para os eixos
principais de inércia e as extensões L >= I >= S são medidas nesse referencial.
    Min Feret (2D, partícula deitada) ~ I     AR = I/L     h = S/I
"""
import csv, json, os, sys, time
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # pasta "Aggregate types"
LIMPO = os.path.join(RAIZ, '01_limpo')
DESCR = os.path.join(RAIZ, '02_descritores')
MODELO = os.path.join(RAIZ, '03_modelo')
_T0 = time.time()


def log(*a):
    print(f'[{time.time()-_T0:8.1f}s]', *a, flush=True)


def caminho(p):
    return p if os.path.isabs(p) else os.path.normpath(os.path.join(RAIZ, p))


def carregar_config(fn):
    with open(fn, encoding='utf-8') as f:
        return json.load(f)


def n_processos(cfg):
    n = cfg.get('processos') or 0
    return n if n > 0 else max(1, (os.cpu_count() or 2) - 1)


def gravar_csv(fn, linhas):
    os.makedirs(os.path.dirname(fn), exist_ok=True)
    if not linhas:
        open(fn, 'w').close(); return
    campos = list(linhas[0].keys())
    for l in linhas[1:]:
        campos += [k for k in l if k not in campos]
    with open(fn, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, campos, delimiter=';'); w.writeheader(); w.writerows(linhas)


def ler_csv(fn):
    with open(fn, encoding='utf-8') as f:
        return list(csv.DictReader(f, delimiter=';'))


def direcoes_fibonacci(n):
    """n direções quase uniformes no hemisfério (largura é simétrica em ±d)."""
    i = np.arange(n) + 0.5
    z = i/n; r = np.sqrt(1 - z**2); t = np.pi*(1 + 5**0.5)*i
    return np.stack([r*np.cos(t), r*np.sin(t), z], 1)


def eixos_principais(v, faces):
    """Centroide e eixos de inércia de um sólido fechado (tetraedros com a origem)."""
    import trimesh
    m = trimesh.Trimesh(v, faces, process=False)
    if m.is_volume:
        c = m.center_mass; I = m.moment_inertia
    else:  # malha aberta: aproxima pelos vértices
        c = v.mean(0); r = v - c
        I = np.eye(3)*np.einsum('ij,ij->i', r, r).sum() - r.T @ r
    w, Q = np.linalg.eigh(I)
    if np.linalg.det(Q) < 0: Q[:, 2] *= -1
    return c, Q


def descrever(v, faces, n_dir=2000):
    """Descritores de forma de uma malha triangular (vértices em mm)."""
    import trimesh
    from scipy.spatial import ConvexHull
    m = trimesh.Trimesh(v, faces, process=True)
    hull = ConvexHull(m.vertices); hv = m.vertices[hull.vertices]
    V = float(abs(m.volume)) if m.is_volume else float('nan')
    A = float(m.area); Vh = float(hull.volume)
    c, Q = eixos_principais(m.vertices, m.faces)
    p = (hv - c) @ Q
    ext = np.sort(p.max(0) - p.min(0))[::-1]
    L, I, S = (float(x) for x in ext)
    # Feret 3D: larguras por direção (mínimo) e maior distância entre vértices do fecho
    d = direcoes_fibonacci(n_dir); proj = hv @ d.T
    larg = proj.max(0) - proj.min(0)
    from scipy.spatial.distance import pdist
    feret_max = float(pdist(hv).max()) if len(hv) < 6000 else float(larg.max())
    feret_min = float(larg.min())
    Vs = V if np.isfinite(V) else Vh
    return dict(
        volume_mm3=Vs, area_mm2=A, volume_fecho_mm3=Vh,
        L_mm=L, I_mm=I, S_mm=S, AR=I/L, h=S/I, S_L=S/L,
        feret_min_mm=feret_min, feret_max_mm=feret_max,
        esfericidade=float(np.pi**(1/3)*(6*Vs)**(2/3)/A),
        convexidade=Vs/Vh,                      # 1 = convexa
        preenchimento_caixa=Vh/(L*I*S),         # alvo da calibração de angulosidade
        d_esfera_eq_mm=float((6*Vs/np.pi)**(1/3)),
        estanque=bool(m.is_watertight),
    )


def d_peneira(r, modo='I'):
    """Abertura de peneira equivalente da partícula."""
    if modo == 'I':
        return r['I_mm']
    if modo == 'IS':  # diagonal da seção I x S (passa em malha quadrada)
        return float(np.sqrt((r['I_mm']**2 + r['S_mm']**2)/2))
    if modo == 'feret_min':
        return r['feret_min_mm']
    raise ValueError(modo)


def importar_md_core(cfg):
    fn = caminho(cfg['md_core'])
    sys.path.insert(0, os.path.dirname(fn))
    import md_core
    return md_core
