#!/usr/bin/env python3
"""Pipeline de agregados reais -> modelo de forma do Marshall digital.

    00_bruto  --stl/ct-->  01_limpo  --descritores-->  02_descritores  --ajuste/biblioteca-->  03_modelo

Uso (na pasta "Aggregate types"):
    python scripts/pipeline.py                                   # todas as etapas
    python scripts/pipeline.py --etapas descritores ajuste       # só algumas
    python scripts/pipeline.py --amostra                         # testa a segmentação da CT num pedaço (QA)
"""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import carregar_config, log

ETAPAS = ['stl', 'ct', 'descritores', 'ajuste', 'biblioteca']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config_pipeline.json'))
    ap.add_argument('--etapas', nargs='+', choices=ETAPAS, default=ETAPAS)
    ap.add_argument('--amostra', action='store_true', help='só a CT, num sub-volume central, para ajustar a segmentação')
    a = ap.parse_args()
    cfg = carregar_config(a.config)
    if a.amostra:
        import e2_ct; e2_ct.rodar(cfg, amostra=True); return
    for e in ETAPAS:
        if e not in a.etapas: continue
        log(f'==== etapa {e} ====')
        if e == 'stl': import e1_stl as m
        elif e == 'ct': import e2_ct as m
        elif e == 'descritores': import e3_descritores as m
        elif e == 'ajuste': import e4_ajuste as m
        else: import e5_biblioteca as m
        m.rodar(cfg)
    log('fim')


if __name__ == '__main__':
    main()
