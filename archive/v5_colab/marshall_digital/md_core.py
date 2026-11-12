"""
Corpo de prova Marshall digital — método de Awuah, Garcia-Hernandez & Valentin (2024),
Construction and Building Materials 416, 135281.

Etapas:
 1. composicao()  -> massas e volumes a partir da granulometria, teor de betume e vazios
 2. agregados()   -> biblioteca de formas (Weibull do AR, Tabela 3) e lista de partículas > 2 mm
 3. simular()     -> despejo no molde e compactação (DEM de aglomerados de esferas, dem.c)
 4. voxelizar()   -> agregados em voxels; mastique e vazios de ar no espaço restante
 5. exportar()    -> STL, pilha TIFF de fases, seções PNG e visualizador HTML autocontido
"""
import json, os, sys, time, pickle, ctypes, subprocess, platform, base64, zipfile
import numpy as np
from scipy import ndimage
from scipy.spatial import ConvexHull

AQUI = os.path.dirname(os.path.abspath(__file__))
EQ3 = {  # Tabela 6 do paper: phi = (b0 + b1 M + b2 NA) / (1 + b3 M + b4 NA), por 250 g
    'trabalhabilidade_pct': [1.70e9, 1.07e7, -9.90e5, 5.90e5, -6.86e3],
    'estabilidade_kN':      [6.25, -1.50e-3, -1.92e-3, -9.52e-3, -2.51e-4],
    'fluencia_mm':          [2.62e-1, 3.97e-2, -5.13e-4, -1.00e-2, -2.62e-4],
    'vazios_pct':           [4.36e8, -2.62e6, -2.0e5, 5.62e5, 2.13e2],
}


def log(*a):
    print(*a, flush=True)


def eq3(M, NA):
    return {k: (b[0]+b[1]*M+b[2]*NA)/(1+b[3]*M+b[4]*NA) for k, b in EQ3.items()}


# ---------------------------------------------------------------- 1. composição
def composicao(cfg):
    s = np.array(cfg['granulometria']['peneiras_mm'], float)
    p = np.array(cfg['granulometria']['passante_pct'], float)
    o = np.argsort(-s); s, p = s[o], p[o]
    Pb = cfg['teor_betume_pct']; ra, rb = cfg['densidade_agregado'], cfg['densidade_betume']
    D = cfg['corpo_de_prova']['diametro_mm']; H = cfg['corpo_de_prova']['altura_mm']; R = D/2
    V = np.pi*R**2*H/1000
    Gmm = 100/((100-Pb)/ra + Pb/rb); Gmb = Gmm*(1-cfg['vazios_alvo_pct']/100)
    mass = Gmb*V; m_agg = mass*(1-Pb/100); m_bit = mass*Pb/100
    p2 = float(np.interp(2.0, s[::-1], p[::-1]))
    m_fine = m_agg*p2/100; m_coarse = m_agg - m_fine
    c = dict(D=D, H=H, R=R, V=V, Gmm=Gmm, Gmb=Gmb, mass=mass, m_agg=m_agg, m_bit=m_bit, pass2=p2,
             m_fine=m_fine, m_coarse=m_coarse, V_coarse=m_coarse/ra,
             M=m_fine/ra + m_bit/rb, V_void=V*cfg['vazios_alvo_pct']/100, k250=250/mass)
    # frações > 2 mm entre peneiras consecutivas
    edges = sorted(set([x for x in s if x > 2] + [2.0]))
    fr = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        pct = np.interp(hi, s[::-1], p[::-1]) - np.interp(lo, s[::-1], p[::-1])
        if pct > 0: fr.append((lo, hi, pct))
    top = s[p >= 99.999].min() if np.any(p >= 99.999) else s.max()
    c['fracoes'] = fr; c['dmax'] = top
    return c


# ---------------------------------------------------------------- 2. agregados
def _forma(rng, par, ang, ngrid=22):
    AR = np.clip(par['AR_escala']*rng.weibull(par['AR_forma']), 0.40, 0.98)
    h = np.clip(par['h']*rng.normal(1, 0.08), 0.42, 0.95)
    dims = np.array([1/AR, 1.0, h])
    npts = 36
    areas = np.array([dims[1]*dims[2]]*2 + [dims[0]*dims[2]]*2 + [dims[0]*dims[1]]*2)
    face = rng.choice(6, npts, p=areas/areas.sum())
    pts = rng.uniform(-0.5, 0.5, (npts, 3))*dims
    ax = face//2; sg = np.where(face % 2 == 0, -1, 1)
    pts[np.arange(npts), ax] = sg*dims[ax]/2*(1-rng.uniform(0, ang, npts))
    v = pts[ConvexHull(pts).vertices]; v = v - v.mean(0)
    v = v*(dims/(v.max(0)-v.min(0)))
    hull = ConvexHull(v); v = v[hull.vertices]; hull = ConvexHull(v); eq = hull.equations
    g = np.stack(np.meshgrid(*[np.linspace(v[:, i].min(), v[:, i].max(), ngrid) for i in range(3)],
                             indexing='ij'), -1).reshape(-1, 3)
    d = (-(g @ eq[:, :3].T + eq[:, 3])).min(1); gi = g[d > 0]
    c = gi.mean(0); vol = hull.volume; r_ = gi - c
    I = (np.eye(3)*np.einsum('ij,ij->i', r_, r_).sum() - r_.T @ r_)/len(gi)*vol
    w, Q = np.linalg.eigh(I)
    v = (v - c) @ Q; gi = (gi - c) @ Q
    hull = ConvexHull(v); eq = hull.equations
    di = (-(gi @ eq[:, :3].T + eq[:, 3])).min(1)
    # aglomerado de esferas: escolha gulosa por volume coberto
    rr = di*1.10
    cidx = rng.choice(len(gi), min(500, len(gi)), replace=False)
    Dm = np.linalg.norm(gi[cidx][:, None, :] - gi[None, :, :], axis=2) < rr[cidx][:, None]
    cov = np.zeros(len(gi), bool); sp = []
    for _ in range(10):
        gain = (Dm & ~cov[None, :]).sum(1)*(rr[cidx] > 0.07)
        j = int(np.argmax(gain))
        if gain[j] < 0.01*len(gi): break
        sp.append((*gi[cidx[j]], rr[cidx[j]])); cov |= Dm[j]
        if cov.mean() > 0.96: break
    f = hull.simplices.copy(); cen = v[f].mean(1)
    n = np.cross(v[f[:, 1]]-v[f[:, 0]], v[f[:, 2]]-v[f[:, 0]])
    flip = (n*cen).sum(1) < 0; f[flip] = f[flip][:, ::-1]
    return dict(verts=v, faces=f, vol=vol, I=w, spheres=np.array(sp))


def agregados(cfg, c, ntpl=80):
    rng = np.random.default_rng(cfg['simulacao']['semente'])
    cls = cfg['forma_agregados']['classes']; ang = cfg['forma_agregados'].get('angulosidade', 0.28)
    T, off = [], []
    for par in cls:
        off.append(len(T)); T += [_forma(rng, par, ang) for _ in range(ntpl)]
    log(f'  {len(T)} formas geradas')

    def classe(d):
        for k, par in enumerate(cls):
            if d <= par['ate_mm'] + 1e-9: return k
        return len(cls)-1

    def sortear(k_, seed=7):
        r = np.random.default_rng(seed); parts = []; rel = {}
        for lo, hi, pct in c['fracoes']:
            alvo = c['m_agg']*pct/100; acc = 0.0; n = 0; kc = classe(hi)
            while True:
                d = np.exp(r.uniform(np.log(lo), np.log(hi))); s = k_*d
                ti = off[kc] + int(r.integers(ntpl))
                mg = T[ti]['vol']*s**3*cfg['densidade_agregado']/1000
                if acc + mg - alvo > alvo - acc: break
                acc += mg; n += 1; parts.append((ti, s))
            rel[f'{lo:g}-{hi:g} mm'] = dict(n=n, massa_g=round(acc, 1), alvo_g=round(alvo, 1))
        return np.array(parts), rel

    cal = cfg['calibracao_tamanho']
    if cal['modo'] == 'NA_250g':
        lo, hi = 0.6, 2.0
        for _ in range(28):
            km = (lo+hi)/2
            if len(sortear(km)[0])*c['k250'] > cal['NA_250g']: lo = km
            else: hi = km
        k_ = (lo+hi)/2
    else:
        k_ = cal['fator']
    parts, rel = sortear(k_)
    log(f'  fator Min Feret/peneira = {k_:.3f}; NA = {len(parts)} ({len(parts)*c["k250"]:.0f} por 250 g)')
    return T, parts, rel, k_


# ---------------------------------------------------------------- 3. simulação
def compilar_dem():
    src = os.path.join(AQUI, 'dem.c')
    ext = '.dll' if platform.system() == 'Windows' else '.so'
    lib = os.path.join(AQUI, 'libdem' + ext)
    if os.path.exists(lib) and os.path.getmtime(lib) > os.path.getmtime(src):
        return lib
    win = platform.system() == 'Windows'
    cmds = [[cc, '-O3', '-shared', src, '-o', lib] + ([] if win else ['-fPIC', '-lm'])
            for cc in (['gcc', 'clang'] if win else ['cc', 'gcc', 'clang'])]
    zig = [sys.executable, '-m', 'ziglang', 'cc', '-O3', '-shared', src, '-o', lib] + ([] if win else ['-fPIC', '-lm'])
    cmds.append(zig)
    for cmd in cmds:
        try:
            subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return lib
        except (OSError, subprocess.CalledProcessError):
            continue
    # último recurso: instala o compilador zig pelo pip e tenta de novo
    try:
        log('  instalando compilador C (pip install ziglang)…')
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'ziglang'])
        subprocess.check_call(zig)
        return lib
    except (OSError, subprocess.CalledProcessError):
        pass
    sys.exit('Não encontrei um compilador C (gcc/clang). Use o notebook no Google Colab, '
             'ou instale: macOS -> "xcode-select --install"; Windows -> WSL ou MinGW-w64.')


def simular(cfg, c, T, parts, pasta):
    lib = ctypes.CDLL(compilar_dem())
    Dp = np.ctypeslib.ndpointer(np.float64, flags='C'); Ip = np.ctypeslib.ndpointer(np.int32, flags='C')
    dbl = ctypes.c_double
    lib.run.argtypes = [ctypes.c_int, Ip, Ip, Dp, Dp, Dp, Dp, Dp, Dp, Dp, Dp, dbl, ctypes.POINTER(dbl),
                        dbl, dbl, ctypes.c_int] + [dbl]*9 + [Dp]
    lib.run.restype = ctypes.c_int
    lib.set_coat.argtypes = [dbl]
    rho = cfg['densidade_agregado']*1e-6
    R, H = c['R'], c['H']
    rng = np.random.default_rng(cfg['simulacao']['semente'] + 1)
    parts = parts[rng.permutation(len(parts))]
    n = len(parts)
    st, sn, sl = [], [], []; mass = np.zeros(n); Ib = np.zeros((n, 3)); brad = np.zeros(n); k = 0
    for i, (ti, s) in enumerate(parts):
        t = T[int(ti)]; sp = t['spheres']*s
        st.append(k); sn.append(len(sp)); k += len(sp); sl.append(sp)
        mass[i] = t['vol']*s**3*rho; Ib[i] = t['I']*s**5*rho
        brad[i] = (np.linalg.norm(sp[:, :3], axis=1) + sp[:, 3]).max()
    st = np.array(st, np.int32); sn = np.array(sn, np.int32); sl = np.ascontiguousarray(np.vstack(sl))
    # chuva inicial sem sobreposição
    pos = np.zeros((n, 3)); z = 0.0
    for i in range(n):
        rb = brad[i]
        for tries in range(200):
            rr = (R - rb - 0.2)*np.sqrt(rng.uniform()); th = rng.uniform(0, 2*np.pi)
            p = np.array([rr*np.cos(th), rr*np.sin(th), z + rb + rng.uniform(0, 2)])
            P = pos[max(0, i-500):i]; B = brad[max(0, i-500):i]
            if i and np.any(np.linalg.norm(P - p, axis=1) < B + rb + 0.1):
                if tries % 20 == 19: z += 0.5
                continue
            break
        pos[i] = p
    q = rng.normal(size=(n, 4)); q /= np.linalg.norm(q, axis=1)[:, None]
    pos = np.ascontiguousarray(pos); q = np.ascontiguousarray(q)
    vel = np.zeros((n, 3)); w = np.zeros((n, 3)); Ib = np.ascontiguousarray(Ib)
    zp = dbl(1e4); out = np.zeros(5); tt = [0.0]; dt = 1e-5

    def run(ns, mu, gd, zpt=1e4, vp=0.0):
        lib.run(n, st, sn, sl, pos, q, vel, w, mass, Ib, brad, R, ctypes.byref(zp), zpt, vp,
                ns, dt, 9810., 1e3, 0.3, mu, gd, 0., 0., tt[0], out)
        tt[0] += ns*dt

    t0 = time.time(); sim = cfg['simulacao']
    lib.set_coat(0.0)
    log(f'  despejo de {n} agregados (coluna inicial de {pos[:, 2].max():.0f} mm)…')
    for it in range(600):
        run(500, sim['atrito_despejo'], 3.0)
        if it % 20 == 0:
            log(f'    t={tt[0]:.2f}s topo={out[3]:.1f} mm ({time.time()-t0:.0f}s)')
        if tt[0] > 0.3 and out[2] < 50: break
    log(f'  leito após despejo: {out[3]:.1f} mm; compactando até {H} mm…')
    zp.value = max(out[3], H) + 0.5
    while zp.value > H + 1e-9:
        run(500, 0.15, 4.0, H, 80.0)
    coat = 0.0; Fstop = sim['forca_final_pistao_N']*1e3
    while out[1] <= Fstop and coat < 1.0:
        coat += 0.004; lib.set_coat(coat)
        for _ in range(4): run(250, sim['atrito_compactacao'], 6.0, H, 0.0)
    log(f'  película de mastique equivalente: {coat:.3f} mm; força no pistão {out[1]/1e3:.1f} N')
    for _ in range(30): run(500, 0.35, 8.0, H, 0.0)
    log(f'  simulação concluída em {time.time()-t0:.0f} s')
    np.savez(os.path.join(pasta, 'estado_final.npz'), pos=pos, q=q, parts=parts, coat=coat)
    return pos, q, parts, coat


# ---------------------------------------------------------------- 4. voxelização
def _qmat(q):
    w, a, b, c = q
    return np.array([[1-2*(b*b+c*c), 2*(a*b-w*c), 2*(a*c+w*b)],
                     [2*(a*b+w*c), 1-2*(a*a+c*c), 2*(b*c-w*a)],
                     [2*(a*c-w*b), 2*(b*c+w*a), 1-2*(a*a+b*b)]])


def voxelizar(cfg, c, T, pos, q, parts):
    h = cfg['voxel_mm']; R, H = c['R'], c['H']
    nx = int(np.ceil(2*R/h)); nz = int(np.ceil(H/h))
    x = (np.arange(nx)+0.5)*h - R; z = (np.arange(nz)+0.5)*h
    lab = np.zeros((nx, nx, nz), np.int32); over = 0
    eqs = [ConvexHull(t['verts']).equations for t in T]
    for i, (ti, s) in enumerate(parts):
        t = T[int(ti)]; Rm = _qmat(q[i]); V = t['verts']*s @ Rm.T + pos[i]
        lo = np.maximum(np.floor((V.min(0) - [-R, -R, 0])/h).astype(int), 0)
        hi = np.minimum(np.ceil((V.max(0) - [-R, -R, 0])/h).astype(int), [nx, nx, nz])
        if np.any(hi <= lo): continue
        X, Y, Z = np.meshgrid(x[lo[0]:hi[0]], x[lo[1]:hi[1]], z[lo[2]:hi[2]], indexing='ij')
        P = np.stack([X, Y, Z], -1).reshape(-1, 3) - pos[i]
        e = eqs[int(ti)]
        ins = ((P @ (e[:, :3] @ Rm.T).T + e[:, 3]*s) <= 0).all(1).reshape(X.shape)
        sub = lab[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
        over += np.count_nonzero(ins & (sub > 0)); sub[ins & (sub == 0)] = i+1
    cyl = (x[:, None]**2 + x[None, :]**2 <= R**2)[:, :, None] & np.ones(nz, bool)[None, None, :]
    lab[~cyl] = 0
    vv = h**3/1000; free = cyl & (lab == 0)
    dist = ndimage.gaussian_filter(ndimage.distance_transform_edt(lab == 0, sampling=h).astype(np.float32), 1.0)
    rng = np.random.default_rng(cfg['simulacao']['semente'] + 2)
    noise = ndimage.gaussian_filter(rng.normal(size=lab.shape).astype(np.float32), 4.0); noise /= noise.std()
    rr = np.sqrt(x[:, None]**2 + x[None, :]**2)[:, :, None]
    dwall = np.minimum(np.minimum(R - rr, z[None, None, :]), H - z[None, None, :]).astype(np.float32)
    score = dist + 0.25*noise + 0.35*np.exp(-dwall/1.0); score[~free] = -1e9
    del noise, dwall, dist
    nvoid = int(round(c['V_void']/vv)); ball = ndimage.generate_binary_structure(3, 1)

    def voids_at(thr):
        v = ndimage.binary_opening(free & (score >= thr), ball)
        lb, _ = ndimage.label(v); sz = np.bincount(lb.ravel()); keep = sz >= 30; keep[0] = False
        return keep[lb]

    lo, hi = np.percentile(score[free], 50), np.percentile(score[free], 99.95)
    void = None
    for _ in range(16):
        thr = (lo+hi)/2; void = voids_at(thr); nv = np.count_nonzero(void)
        if nv > nvoid: lo = thr
        else: hi = thr
        if abs(nv - nvoid) < 0.005*nvoid: break
    phase = np.zeros(lab.shape, np.uint8)
    phase[free & ~void] = 1; phase[void] = 2; phase[lab > 0] = 3
    st = dict(V_cil=np.count_nonzero(cyl)*vv, V_agregados=np.count_nonzero(lab)*vv, V_sobreposicao=over*vv,
              V_mastique=np.count_nonzero(phase == 1)*vv, V_vazios=np.count_nonzero(void)*vv)
    st['AVC'] = st['V_vazios']/st['V_cil']*100
    return phase, lab, st


# ---------------------------------------------------------------- 5. exportação
def _stl(fn, tris, name):
    tris = tris.astype(np.float32)
    nrm = np.cross(tris[:, 1]-tris[:, 0], tris[:, 2]-tris[:, 0])
    nrm /= np.linalg.norm(nrm, axis=1)[:, None] + 1e-12
    rec = np.zeros(len(tris), dtype=[('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')])
    rec['n'] = nrm; rec['v'] = tris
    with open(fn, 'wb') as f:
        f.write(name.encode('ascii', 'replace')[:80].ljust(80, b' '))
        f.write(np.uint32(len(tris)).tobytes()); f.write(rec.tobytes())


def _mc(mask, step, sigma, h, R):
    from skimage.measure import marching_cubes
    m = mask.astype(np.float32)
    if step > 1:
        sh = (np.array(m.shape)//step)*step
        m = m[:sh[0], :sh[1], :sh[2]].reshape(sh[0]//step, step, sh[1]//step, step, sh[2]//step, step).mean((1, 3, 5))
    if sigma: m = ndimage.gaussian_filter(m, sigma)
    v, f, _, _ = marching_cubes(np.pad(m, 1), 0.5)
    v = (v - 0.5)*h*step; v[:, 0] -= R; v[:, 1] -= R
    return v, f


def exportar(cfg, c, T, pos, q, parts, k_, phase, lab, st, coat, pasta):
    from PIL import Image
    h = cfg['voxel_mm']; R, H = c['R'], c['H']; nome = cfg['nome']
    ds = os.path.join(pasta, 'stl'); os.makedirs(ds, exist_ok=True)
    nx, _, nz = phase.shape
    # agregados
    tris = np.concatenate([(T[int(ti)]['verts']*s @ _qmat(q[i]).T + pos[i])[T[int(ti)]['faces']]
                           for i, (ti, s) in enumerate(parts)])
    _stl(os.path.join(ds, f'{nome}_agregados.stl'), tris, f'{nome} agregados')
    v, f = _mc(phase == 2, 2, 0.5, h, R); _stl(os.path.join(ds, f'{nome}_vazios.stl'), v[f], 'vazios')
    v, f = _mc(phase == 1, 4, 0.0, h, R); _stl(os.path.join(ds, f'{nome}_mastique_1mm.stl'), v[f], 'mastique')
    th = np.linspace(0, 2*np.pi, 129)[:-1]
    r0 = np.c_[R*np.cos(th), R*np.sin(th), np.zeros_like(th)]; r1 = r0 + [0, 0, H]; env = []
    for k in range(len(th)):
        a, b = k, (k+1) % len(th)
        env += [[r0[a], r0[b], r1[b]], [r0[a], r1[b], r1[a]], [[0, 0, 0], r0[b], r0[a]], [[0, 0, H], r1[a], r1[b]]]
    _stl(os.path.join(ds, f'{nome}_envelope.stl'), np.array(env), 'envelope')
    pages = [Image.fromarray(phase[:, :, k].T[::-1].copy()) for k in range(nz)]
    pages[0].save(os.path.join(ds, f'{nome}_fases_voxel.tif'), save_all=True, append_images=pages[1:],
                  compression='tiff_deflate')
    # seções PNG (em memória, entram no HTML)
    stone = [(184, 178, 166), (164, 158, 147), (199, 192, 178), (146, 141, 132), (210, 203, 190)]
    fraccol = [(232, 197, 71), (214, 135, 64), (91, 141, 196), (64, 92, 168), (176, 72, 140)]
    pal = [(0, 0, 0), (30, 29, 28), (226, 61, 40)] + stone + fraccol
    palf = sum([list(x) for x in pal], []) + [0]*(768 - 3*len(pal))
    sieve = parts[:, 1]/k_
    edges = [2] + [hi for lo, hi, _ in c['fracoes']]
    frac = np.clip(np.searchsorted(edges, sieve) - 1, 0, 4)
    # rótulos das frações para a legenda (até 5 grupos)
    tone = (np.arange(len(parts))*2654435761 % 5).astype(np.uint8)
    luts = {'s': np.r_[0, 3+tone].astype(np.uint8), 'f': np.r_[0, 8+frac].astype(np.uint8)}
    import io
    sec = {}

    def img(ph, lb, lut):
        a = np.zeros(ph.shape, np.uint8); a[ph == 1] = 1; a[ph == 2] = 2; m = ph == 3; a[m] = lut[lb[m]]
        im = Image.fromarray(a, 'P'); im.putpalette(palf); b = io.BytesIO()
        im.save(b, 'PNG', optimize=True, transparency=0)
        return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()

    zs = np.arange(0.5, H, 1.0); xs = np.arange(-np.floor(R/2)*2, np.floor(R/2)*2+0.1, 2.0)
    for md, lut in luts.items():
        for k, zz in enumerate(zs):
            iz = min(int(zz/h), nz-1); sec[f'{md}z{k}'] = img(phase[:, :, iz].T[::-1], lab[:, :, iz].T[::-1], lut)
        for k, xx in enumerate(xs):
            ix = min(max(int((xx+R)/h), 0), nx-1); sec[f'{md}x{k}'] = img(phase[ix].T[::-1], lab[ix].T[::-1], lut)
    vv, vf = _mc(phase == 2, 3, 0.45, h, R)
    b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    tpl = [dict(v=b64(t['verts'].astype(np.float32)), f=b64(t['faces'].astype(np.uint16))) for t in T]
    inst = np.c_[parts[:, 0], parts[:, 1], pos, q, frac, tone].astype(np.float32)
    # textos do painel
    k250 = c['k250']; NA = len(parts); M250 = c['M']*k250; NA250 = NA*k250
    pr = eq3(M250, NA250)
    fmt = lambda x, d=1: f'{x:,.{d}f}'.replace(',', ' ').replace('.', ',')
    nomes = [('trabalhabilidade_pct', 'Trabalhabilidade ω, %'), ('estabilidade_kN', 'Estabilidade S, kN'),
             ('fluencia_mm', 'Fluência F, mm'), ('vazios_pct', 'Vazios AVC, %')]
    head = ['', 'Eq. (3)']; cols = [pr]
    for key, lbl in [('propriedades_nomograma', 'Nomograma'), ('propriedades_medidas', 'Medido')]:
        if cfg.get(key): head.append(lbl); cols.append(cfg[key])
    props = [[lbl] + [fmt(cc[k]) if cc.get(k) is not None else '—' for cc in cols] for k, lbl in nomes]
    props.append(['Vazios no modelo virtual, %', fmt(st['AVC'])] + ['']*(len(head)-2))
    meta = dict(
        title_html=f'Corpo de Prova <span>{nome}</span>',
        spec=f"{cfg.get('descricao', '')} · betume {fmt(cfg['teor_betume_pct'])} % · Marshall Ø{fmt(c['D'])} × {fmt(c['H'])} mm",
        comp=[['Massa total', f"{fmt(c['mass'], 0)} g"], [f"Betume ({fmt(cfg['teor_betume_pct'])} %)", f"{fmt(c['m_bit'])} g"],
              ['Agregados &gt; 2 mm', f"{fmt(c['m_coarse'], 0)} g · {fmt(st['V_agregados'], 0)} cm³"],
              ['Número de agregados NA', f"{fmt(NA, 0)} ({fmt(NA250, 0)})"],
              ['Volume de mastique M', f"{fmt(st['V_mastique'])} cm³ ({fmt(M250)})"],
              ['Vazios de ar', f"{fmt(st['V_vazios'])} cm³"],
              ['Película de mastique', f"{fmt(coat, 2)} mm"],
              ['Gmm · Gmb', f"{fmt(c['Gmm'], 3)} · {fmt(c['Gmb'], 3)} Mg/m³"]],
        props_head=head, props=props,
        propnote=f'Eq. (3) com os coeficientes da Tabela 6 para M = {fmt(M250)} cm³ e NA = {fmt(NA250, 0)} (por 250 g).',
        M250=round(M250, 1), NA250=int(round(NA250)))
    data = dict(R=R, H=H, zs=zs.tolist(), xs=xs.tolist(), tpl=tpl, inst=b64(inst), ninst=NA,
                void_v=b64(vv.astype(np.float32)), void_f=b64(vf.astype(np.uint32)), meta=meta)
    html = open(os.path.join(AQUI, 'viewer_template.html'), encoding='utf-8').read()
    html = html.replace('/*__TITLE__*/', f'Corpo de Prova {nome}')
    html = html.replace('/*__DATA__*/', 'window.V5DATA=' + json.dumps(data) + ';window.V5SEC=' + json.dumps(sec) + ';')
    fv = os.path.join(pasta, f'{nome}_visualizador.html')
    open(fv, 'w', encoding='utf-8').write(html)
    rel = dict(composicao={k: v for k, v in c.items() if k != 'fracoes'}, voxel=st, NA=NA, NA_250g=NA250,
               M_250g=M250, pelicula_mastique_mm=coat, fator_minferet=k_, eq3=pr)
    json.dump(rel, open(os.path.join(pasta, f'{nome}_resultados.json'), 'w'), indent=1, ensure_ascii=False,
              default=float)
    with zipfile.ZipFile(os.path.join(pasta, f'{nome}_STL.zip'), 'w', zipfile.ZIP_DEFLATED) as zf:
        for fn in sorted(os.listdir(ds)): zf.write(os.path.join(ds, fn), fn)
    return fv, rel


# ---------------------------------------------------------------- orquestração
def rodar(cfg_path, saida=None):
    cfg = json.load(open(cfg_path, encoding='utf-8'))
    pasta = saida or os.path.join(os.path.dirname(os.path.abspath(cfg_path)), 'resultado_' + cfg['nome'])
    os.makedirs(pasta, exist_ok=True); t0 = time.time()
    log('1/5 composição'); c = composicao(cfg)
    log(f"  massa {c['mass']:.0f} g; agregados > 2 mm {c['V_coarse']:.1f} cm³; mastique {c['M']:.1f} cm³; vazios {c['V_void']:.1f} cm³")
    log('2/5 agregados virtuais'); T, parts, rel, k_ = agregados(cfg, c)
    for k, v in rel.items(): log(f'    {k}: {v["n"]} partículas, {v["massa_g"]} g')
    log('3/5 despejo e compactação'); pos, q, parts, coat = simular(cfg, c, T, parts, pasta)
    log('4/5 mastique e vazios'); phase, lab, st = voxelizar(cfg, c, T, pos, q, parts)
    log(f"  agregados {st['V_agregados']:.1f} cm³, mastique {st['V_mastique']:.1f} cm³, vazios {st['V_vazios']:.1f} cm³ (AVC {st['AVC']:.2f} %)")
    log('5/5 exportação'); fv, res = exportar(cfg, c, T, pos, q, parts, k_, phase, lab, st, coat, pasta)
    log(f'Pronto em {time.time()-t0:.0f} s. Visualizador: {fv}')
    log('Eq. (3): ' + ', '.join(f'{k} = {v:.2f}' for k, v in res['eq3'].items()))
    return pasta
