"""Teste: sobe só o servidor do mini app (página + mdsim) numa porta fixa, sem janela."""
import sys
import threading

sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'src'))
from marshall_simulator.app import Nativo, servidor  # noqa: E402

nativo = Nativo()
srv, url = servidor(nativo, int(sys.argv[1]) if len(sys.argv) > 1 else 8772)
print(url, 'mdsim:', nativo.ok, flush=True)
threading.Event().wait()
