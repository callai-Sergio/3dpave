"""Uso:  python run.py config_V5.json
Gera a pasta resultado_<nome>/ com o visualizador HTML, os STL e um JSON com os resultados."""
import sys
from md_core import rodar

if __name__ == '__main__':
    rodar(sys.argv[1] if len(sys.argv) > 1 else 'config_V5.json')
