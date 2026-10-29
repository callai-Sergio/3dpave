"""Etapa 1a: limpa as malhas STL (F004) e grava em 01_limpo/<fonte>/<grupo>/*.ply + indice.csv."""
import glob, os
import numpy as np
from comum import LIMPO, caminho, gravar_csv, log


def limpar(fn, escala):
    import trimesh
    m = trimesh.load(fn, force='mesh')
    m.apply_scale(escala)
    m.update_faces(m.nondegenerate_faces()); m.update_faces(m.unique_faces())
    m.remove_unreferenced_vertices(); m.merge_vertices()
    if not m.is_watertight:
        trimesh.repair.fill_holes(m)
    trimesh.repair.fix_normals(m)
    if m.volume < 0: m.invert()
    return m


def rodar(cfg):
    for item in cfg.get('stl', []):
        pasta = caminho(item['pasta'])
        saida = os.path.join(LIMPO, item['fonte'], item['grupo'])
        os.makedirs(saida, exist_ok=True)
        arqs = sorted(f for f in glob.glob(os.path.join(pasta, '*')) if f.lower().endswith('.stl'))
        log(f'STL {item["fonte"]}/{item["grupo"]}: {len(arqs)} arquivos')
        idx = []
        for fn in arqs:
            nome = os.path.splitext(os.path.basename(fn))[0]
            try:
                m = limpar(fn, item.get('escala_para_mm', 1.0))
            except Exception as e:
                log(f'  {nome}: ERRO {e}'); continue
            out = os.path.join(saida, nome + '.ply'); m.export(out)
            idx.append(dict(fonte=item['fonte'], grupo=item['grupo'], particula=nome,
                            arquivo=os.path.relpath(out, LIMPO), origem=os.path.basename(fn),
                            n_faces=len(m.faces), estanque=m.is_watertight, toca_borda=False))
        gravar_csv(os.path.join(saida, 'indice.csv'), idx)
        log(f'  {len(idx)} malhas limpas; {sum(not r["estanque"] for r in idx)} não estanques')
