"""Etapa 1b: segmenta os agregados na micro-CT (F001, SMA 11 S) e grava cada partícula como malha.

Passos: pilha TIFF (com binning) -> recorte cilíndrico da ROI -> suavização -> limiar multi-Otsu
(vazio / mastique / agregado) -> abertura e preenchimento -> watershed na distância euclidiana ->
uma malha por rótulo (marching cubes + Taubin) em 01_limpo/<fonte>/<grupo>/.

Partículas cortadas pela borda da ROI (lateral ou topo/fundo) são marcadas com toca_borda=True
e ficam fora do ajuste, porque a forma delas está truncada.

Memória aproximada (pico, no watershed): binning 2 ~ 25-30 GB; binning 3 ~ 8-10 GB.
"""
import glob, os, re
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
import numpy as np
from scipy import ndimage
from comum import LIMPO, caminho, gravar_csv, log, n_processos


def achar_fatias(pasta, scan):
    melhor, n = None, 0
    for d, _, fs in os.walk(caminho(pasta)):
        if scan not in d: continue
        k = sum(f.startswith('slice_') and f.lower().endswith('.tif') for f in fs)
        if k > n: melhor, n = d, k
    if not melhor:
        raise FileNotFoundError(f'nenhuma pasta com slice_*.tif e "{scan}" em {caminho(pasta)}')
    return melhor


def voxel_do_txt(d):
    for fn in glob.glob(os.path.join(d, '*.txt')):
        with open(fn, encoding='latin-1') as f:
            m = re.search(r'Voxel size\s*=\s*([\d.]+)\s*mm', f.read())
        if m: return float(m.group(1))
    raise ValueError(f'voxel_mm não encontrado em {d}; informe no config')


def carregar(d, b, amostra=None):
    import tifffile
    fs = sorted(glob.glob(os.path.join(d, 'slice_*.tif')))
    if amostra and amostra < len(fs):
        i0 = (len(fs) - amostra)//2; fs = fs[i0:i0+amostra]
    s0 = tifffile.imread(fs[0]); ny, nx = s0.shape[0]//b, s0.shape[1]//b; nz = len(fs)//b
    log(f'  {len(fs)} fatias {s0.shape} {s0.dtype} -> volume {nz}x{ny}x{nx} (binning {b})')
    vol = np.empty((nz, ny, nx), np.float32)

    def bloco(k):
        acc = np.zeros((ny*b, nx*b), np.float32)
        for f in fs[k*b:(k+1)*b]:
            acc += tifffile.imread(f)[:ny*b, :nx*b]
        vol[k] = acc.reshape(ny, b, nx, b).mean((1, 3))/b

    with ThreadPoolExecutor(8) as ex:
        list(ex.map(bloco, range(nz)))
    return vol


def _png(fn, img):
    from PIL import Image
    Image.fromarray(np.clip(img*255, 0, 255).astype(np.uint8)).save(fn)


def _histograma(fn, amostra, limiares, t):
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(7, 3.5))
    ax.hist(amostra, 256, color='0.4'); ax.set_yscale('log')
    for x in limiares: ax.axvline(x, color='C0', ls='--')
    ax.axvline(t, color='C3', label=f'limiar agregado = {t:.0f}'); ax.legend()
    ax.set_xlabel('intensidade'); fig.tight_layout(); fig.savefig(fn, dpi=110); plt.close(fig)


def _malha(args):
    """Worker: rótulo -> malha PLY. Recebe o sub-volume booleano já recortado."""
    k, sub, off, vox, it, out, borda = args
    import trimesh
    from skimage.measure import marching_cubes
    sub = np.pad(sub, 2)
    f = ndimage.gaussian_filter(sub.astype(np.float32), 0.7)
    v, fa, _, _ = marching_cubes(f, 0.5, spacing=(vox, vox, vox))
    v = v + (np.array(off) - 2)*vox
    m = trimesh.Trimesh(v[:, ::-1], fa[:, ::-1], process=True)  # (z,y,x) -> (x,y,z)
    if it: trimesh.smoothing.filter_taubin(m, iterations=it)
    if m.volume < 0: m.invert()
    m.export(out)
    return k, len(m.faces), bool(m.is_watertight)


def segmentar(item, sg, nproc, amostra=False):
    from skimage.filters import threshold_multiotsu
    from skimage.feature import peak_local_max
    from skimage.segmentation import watershed, find_boundaries
    from skimage.morphology import ball

    d = achar_fatias(item['pasta'], item['scan'])
    b = sg['binning']; vox = (item.get('voxel_mm') or voxel_do_txt(d))*b
    saida = os.path.join(LIMPO, item['fonte'], item['grupo'] + ('_amostra' if amostra else ''))
    os.makedirs(saida, exist_ok=True)
    log(f'CT {item["fonte"]}/{item["grupo"]}: {d}; voxel efetivo {vox:.4f} mm')

    vol = carregar(d, b, sg['amostra_fatias'] if amostra else None)
    nz = vol.shape[0]; z0 = int(nz*sg['corte_z_frac']); vol = vol[z0:nz-z0]
    nz, ny, nx = vol.shape
    cy, cx = (ny-1)/2, (nx-1)/2; R = sg['raio_roi_frac']*min(ny, nx)/2
    yy, xx = np.ogrid[:ny, :nx]; roi = (yy-cy)**2 + (xx-cx)**2 <= R**2

    metodo = sg.get('metodo_limiar', 'textura')
    rng = np.random.default_rng(0)
    zi = rng.integers(nz, size=4_000_000); yi = rng.integers(ny, size=zi.size); xi = rng.integers(nx, size=zi.size)
    ok = roi[yi, xi]; zi, yi, xi = zi[ok], yi[ok], xi[ok]
    fatias_qa = [int(nz*f) for f in (0.25, 0.5, 0.75)]
    p0, p1 = np.percentile(vol[zi[:200000], yi[:200000], xi[:200000]], [0.5, 99.5])
    cinza_qa = [np.clip((vol[z] - p0)/(p1 - p0), 0, 1) for z in fatias_qa]

    if metodo == 'textura':
        # Intensidade média + desvio-padrão local -> GMM de 4 fases (vazio, mastique, agregado cinza,
        # agregado claro). O mastique é texturizado (finos claros); o agregado cinza tem quase a mesma
        # intensidade, mas é liso. Vazio = fase mais escura; mastique = a mais texturizada das outras três;
        # agregado = as duas restantes.
        # A janela σ borra a borda (ela parece texturizada), então a classificação só dá NÚCLEOS seguros;
        # a fronteira real sai depois de um watershed no gradiente (abaixo).
        from sklearn.mixture import GaussianMixture
        s = sg.get('sigma_textura_vox', 4)
        m = ndimage.gaussian_filter(vol, s)
        sd = ndimage.gaussian_filter(vol*vol, s)
        sd -= m*m; np.maximum(sd, 0, out=sd); np.sqrt(sd, out=sd); sd += 1; np.log(sd, out=sd)
        X = np.stack([m[zi, yi, xi], sd[zi, yi, xi]], 1)
        g = GaussianMixture(4, random_state=0).fit(X[::8])
        o = np.argsort(g.means_[:, 0]); resto = o[1:]
        mastique = resto[np.argmax(g.means_[resto, 1])]
        classe_agg = [int(k) for k in resto if k != mastique]
        t_claro = (g.means_[mastique, 0] + g.means_[o[-1], 0])/2  # claro o bastante = agregado, liso ou não
        log(f'  GMM (intensidade, log dp) por fase: {np.round(g.means_[o], 2).tolist()}; '
            f'mastique = fase {int(np.where(o == mastique)[0][0])}; claro > {t_claro:.0f}')
        fase = np.zeros(m.shape, np.uint8)
        for z0_ in range(0, nz, 16):
            Xs = np.stack([m[z0_:z0_+16].ravel(), sd[z0_:z0_+16].ravel()], 1)
            fase[z0_:z0_+16] = np.argsort(o)[g.predict(Xs)].reshape(m[z0_:z0_+16].shape)  # 0 = mais escura
        agg = np.isin(fase, np.argsort(o)[classe_agg]) | (m > t_claro)
        cor = np.array([[0, 0, 0], [.9, .63, .16], [.24, .47, .86], [.94, .94, .94]])
        for z in fatias_qa:
            _png(os.path.join(saida, f'qa_fases_{z:04d}.png'), np.where(roi[..., None], cor[fase[z]], .3))
        am = X[:, 0]; lim = g.means_[o, 0]; t = float('nan')
        _histograma(os.path.join(saida, 'histograma.png'), am, lim, float(t_claro))
        del m, sd, fase
    else:
        if sg['sigma_suavizacao_vox']:
            vol = ndimage.gaussian_filter(vol, sg['sigma_suavizacao_vox'])
        am = vol[zi, yi, xi]
        if metodo == 'otsu2':  # (vazio + mastique) | agregado
            from skimage.filters import threshold_otsu
            lim = np.array([threshold_otsu(am)])
        else:                  # vazio | mastique | agregado
            lim = threshold_multiotsu(am, classes=3)
        t = sg['limiar_agregado'] if sg['limiar_agregado'] is not None else float(lim[-1])
        _histograma(os.path.join(saida, 'histograma.png'), am, lim, t)
        log(f'  limiares Otsu {np.round(lim, 1).tolist()}; limiar agregado {t:.1f}')
        agg = vol > t
        del vol; vol = None
    agg &= roi[None]
    if sg.get('fechamento_vox'):
        agg = ndimage.binary_closing(agg, ball(sg['fechamento_vox']))
    if sg['abertura_vox']:
        agg = ndimage.binary_opening(agg, ball(sg['abertura_vox']))
    agg = ndimage.binary_fill_holes(agg)
    log(f'  fração de agregado na ROI: {agg.sum()/(roi.sum()*nz):.3f}')

    try:
        import edt
        dist = edt.edt(agg, parallel=nproc).astype(np.float32)
    except ImportError:
        dist = ndimage.distance_transform_edt(agg).astype(np.float32)
    if sg.get('sigma_distancia_vox'):  # tira os picos espúrios que partem agregados grandes
        dist = ndimage.gaussian_filter(dist, sg['sigma_distancia_vox'])
    thr = 0.4*sg['d_min_mm']/2/vox
    if sg.get('ws_h_mm'):  # h-máximos: um pico só vira semente se tiver proeminência >= h (não parte cristas)
        from skimage.morphology import h_maxima
        mk, npk = ndimage.label(h_maxima(dist, sg['ws_h_mm']/vox) & (dist > thr))
        log(f'  {npk} sementes do watershed (h = {sg["ws_h_mm"]/vox:.1f} vox)')
    else:
        md = max(1, int(round(sg['ws_dist_min_mm']/vox)))
        pk = peak_local_max(dist, min_distance=md, threshold_abs=thr, exclude_border=False)
        npk = len(pk); mk = np.zeros(agg.shape, np.int32); mk[tuple(pk.T)] = np.arange(1, npk+1)
        log(f'  {npk} sementes do watershed (dist. mín. {md} vox)')
    lab = watershed(-dist, mk, mask=agg, compactness=sg['ws_compactacao'])
    del dist, mk

    if vol is not None and sg.get('sigma_gradiente_vox'):
        # Refino da fronteira: núcleos de agregado (rótulos acima) e núcleo da matriz (mastique + vazio,
        # erodido para ficar longe da borda borrada) viram marcadores de um watershed no gradiente.
        r = int(sg.get('sigma_textura_vox', 4)) + 2
        fundo = ndimage.binary_erosion(~agg, ball(r)) & roi[None]
        nlab = int(lab.max()); lab[fundo] = nlab + 1; lab[:, ~roi] = nlab + 1
        del fundo, agg
        elev = ndimage.gaussian_gradient_magnitude(vol, sg['sigma_gradiente_vox']); del vol
        lab = watershed(elev, lab); del elev
        lab[lab == nlab + 1] = 0
        log(f'  fronteiras refinadas no gradiente; fração de agregado: {(lab > 0).sum()/(roi.sum()*nz):.3f}')
    else:
        del agg

    for z, g in zip(fatias_qa, cinza_qa):
        rgb = np.repeat(g[..., None], 3, 2); rgb[find_boundaries(lab[z])] = (1, 0.2, 0.1)
        _png(os.path.join(saida, f'qa_fatia_{z:04d}.png'), rgb)
    if sg['salvar_rotulos'] and not amostra:
        import tifffile
        tifffile.imwrite(os.path.join(saida, 'rotulos.tif'), lab.astype(np.uint32), compression='zlib')

    objs = ndimage.find_objects(lab); vmin = np.pi/6*(sg['d_min_mm']/vox)**3
    tarefas, info = [], {}
    for k, sl in enumerate(objs, 1):
        if sl is None: continue
        sub = lab[sl] == k; n = int(sub.sum())
        if n < vmin: continue
        zz, yy_, xx_ = np.nonzero(sub)
        rr = np.sqrt((yy_ + sl[1].start - cy)**2 + (xx_ + sl[2].start - cx)**2).max()
        borda = bool(sl[0].start == 0 or sl[0].stop == nz or rr > R - 2)
        out = os.path.join(saida, f'P{k:06d}.ply')
        off = (sl[0].start, sl[1].start, sl[2].start)  # canto (z,y,x)
        tarefas.append((k, sub, off, vox, sg['suavizar_malha_iter'], out, borda))
        info[k] = dict(fonte=item['fonte'], grupo=item['grupo'], particula=f'P{k:06d}',
                       arquivo=os.path.relpath(out, LIMPO), n_voxels=n,
                       volume_voxel_mm3=n*vox**3, toca_borda=borda,
                       z_mm=float((sl[0].start+sl[0].stop)/2*vox))
    log(f'  {len(tarefas)} partículas >= {sg["d_min_mm"]} mm (eq.); {sum(t[-1] for t in tarefas)} tocam a borda')
    idx = []
    with ProcessPoolExecutor(nproc) as ex:
        for i, (k, nf, est) in enumerate(ex.map(_malha, tarefas, chunksize=8), 1):
            info[k].update(n_faces=nf, estanque=est); idx.append(info[k])
            if i % 500 == 0: log(f'  {i}/{len(tarefas)} malhas')
    gravar_csv(os.path.join(saida, 'indice.csv'), idx)
    log(f'  malhas em {saida}')


def rodar(cfg, amostra=False):
    for item in cfg.get('ct', []):
        if item.get('usar', True):
            segmentar(item, cfg['segmentacao'], n_processos(cfg), amostra)
