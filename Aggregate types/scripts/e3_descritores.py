"""Etapa 2: descritores de forma de todas as malhas de 01_limpo -> 02_descritores/descritores.csv."""
import glob, os
from concurrent.futures import ProcessPoolExecutor
from comum import DESCR, LIMPO, d_peneira, descrever, gravar_csv, ler_csv, log, n_processos


def _um(args):
    r, n_dir, modo = args
    import trimesh
    try:
        m = trimesh.load(os.path.join(LIMPO, r['arquivo']), force='mesh')
        d = descrever(m.vertices, m.faces, n_dir)
        d['d_peneira_mm'] = d_peneira(d, modo)
        return {**r, **d, 'erro': ''}
    except Exception as e:
        return {**r, 'erro': str(e)[:200]}


def rodar(cfg):
    linhas = []
    for fn in sorted(glob.glob(os.path.join(LIMPO, '**', 'indice.csv'), recursive=True)):
        if '_amostra' in fn: continue
        linhas += ler_csv(fn)
    log(f'Descritores: {len(linhas)} malhas')
    dc = cfg['descritores']
    out = []
    with ProcessPoolExecutor(n_processos(cfg)) as ex:
        for i, r in enumerate(ex.map(_um, [(r, dc['n_direcoes_feret'], dc['d_peneira']) for r in linhas],
                                     chunksize=4), 1):
            out.append(r)
            if i % 500 == 0: log(f'  {i}/{len(linhas)}')
    err = [r for r in out if r['erro']]
    if err: log(f'  {len(err)} com erro (ver coluna "erro")')
    gravar_csv(os.path.join(DESCR, 'descritores.csv'), out)
    log(f'  gravado {os.path.join(DESCR, "descritores.csv")}')
