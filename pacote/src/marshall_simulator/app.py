"""Janela do Marshall Simulator.

Abre a interface (web/marshall_digital_app.html) numa janela própria com o pywebview (WebView2 no Windows).
Um servidor local serve a página e o núcleo em C (bin/mdsim): no Marshall e no giratório, a física da compactação
roda compilada, com todos os núcleos; formas, mastique e bolhas continuam na página. Sem o mdsim para este
sistema, a física roda em JavaScript na página.
Sem o pywebview, ou com --browser, abre a mesma interface no navegador padrão.
"""
import base64
import functools
import http.server
import json
import os
import secrets
import subprocess
import sys
import tempfile
import threading
import webbrowser
from urllib.parse import parse_qs, urlparse

AQUI = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(AQUI, 'web')
MDSIM = os.path.join(AQUI, 'bin', 'mdsim.exe' if os.name == 'nt' else 'mdsim')
HTML = 'marshall_digital_app.html'
TITULO = 'Marshall Simulator'
DADOS = os.environ.get('MARSHALL_SIM_DIR') or os.path.join(os.path.expanduser('~'), '.marshall_simulator')
CURVAS = os.path.join(DADOS, 'minhas_curvas.json')
NUCLEOS = os.cpu_count() or 1


class Api:
    """Funções chamadas pela página (window.pywebview.api.*)."""

    def __init__(self):
        self._janela = None

    def load_curves(self):
        if not os.path.exists(CURVAS):
            return '[]'
        with open(CURVAS, encoding='utf-8') as f:
            return f.read()

    def save_curves(self, texto):
        json.loads(texto)  # valida antes de gravar
        os.makedirs(DADOS, exist_ok=True)
        with open(CURVAS, 'w', encoding='utf-8') as f:
            f.write(texto)
        return CURVAS

    def save_file(self, nome, b64):
        import webview
        tipo = getattr(getattr(webview, 'FileDialog', None), 'SAVE', None) or webview.SAVE_DIALOG
        caminho = self._janela.create_file_dialog(tipo, directory=os.path.expanduser('~'), save_filename=nome)
        if not caminho:
            return ''
        if isinstance(caminho, (list, tuple)):
            caminho = caminho[0]
        with open(caminho, 'wb') as f:
            f.write(base64.b64decode(b64))
        return caminho


class Nativo:
    """Roda o mdsim e guarda a última linha de progresso que ele escreve. Uma simulação nova (o usuário clicou de
    novo em "Gerar corpo de prova") encerra a anterior, que a página já descartou."""

    def __init__(self):
        self.token = secrets.token_urlsafe(16)
        self.ok = os.path.exists(MDSIM)
        self.trava = threading.Lock()
        self.progresso = {}
        self.proc = None

    def cancelar(self):
        p = self.proc
        if p is not None and p.poll() is None:
            p.kill()

    def rodar(self, entrada):
        self.cancelar()
        with self.trava, tempfile.TemporaryDirectory(prefix='mdsim-') as d:
            fin, fout = os.path.join(d, 'in.bin'), os.path.join(d, 'out.bin')
            with open(fin, 'wb') as f:
                f.write(entrada)
            self.progresso = {}
            flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
            p = self.proc = subprocess.Popen([MDSIM, fin, fout, str(NUCLEOS)], stdout=subprocess.DEVNULL,
                                             stderr=subprocess.PIPE, creationflags=flags)
            erro = []
            # o mdsim escreve "P<tab>etapa<tab>fração<tab>texto" a cada passo; o resto é mensagem de erro
            for linha in iter(p.stderr.readline, b''):
                partes = linha.decode('utf-8', 'replace').rstrip('\r\n').split('\t')
                if len(partes) == 4 and partes[0] == 'P':
                    self.progresso = {'stage': partes[1], 'pct': float(partes[2]), 'text': partes[3]}
                else:
                    erro.append('\t'.join(partes))
            if p.wait() != 0:
                raise RuntimeError(f'mdsim terminou com código {p.returncode}: {" ".join(erro)[-500:]}')
            with open(fout, 'rb') as f:
                return f.read()


def servidor(nativo, porta=0):
    """Servidor local: a pasta web e, em native/, o núcleo em C. O token impede que outra página use o mdsim."""

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=WEB, **k)

        def log_message(self, *a):
            pass

        def _json(self, obj, code=200):
            corpo = json.dumps(obj).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)

        def _token_ok(self):
            return parse_qs(urlparse(self.path).query).get('t', [''])[0] == nativo.token

        def do_GET(self):
            rota = urlparse(self.path).path
            if rota == '/native/info':
                return self._json({'ok': nativo.ok, 'token': nativo.token, 'threads': NUCLEOS})
            if rota == '/native/progress':
                return self._json(nativo.progresso if self._token_ok() else {}, 200 if self._token_ok() else 403)
            return super().do_GET()

        def do_POST(self):
            if urlparse(self.path).path != '/native/mdsim' or not self._token_ok() or not nativo.ok:
                return self._json({'erro': 'não autorizado'}, 403)
            entrada = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            try:
                saida = nativo.rodar(entrada)
            except Exception as e:  # o worker cai para o JavaScript
                return self._json({'erro': str(e)}, 500)
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(len(saida)))
            self.end_headers()
            self.wfile.write(saida)

    srv = http.server.ThreadingHTTPServer(('127.0.0.1', porta), Handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/{HTML}'


def aviso(texto):
    """No .exe sem console (PyInstaller --windowed) não há saída padrão: um print() derrubaria o app."""
    if sys.stdout is not None:
        print(texto, flush=True)


def main():
    if not os.path.exists(os.path.join(WEB, HTML)):
        sys.exit(f'Não encontrei {HTML} em {WEB}. Reinstale o pacote.')
    nativo = Nativo()
    srv, url = servidor(nativo)
    motor = f'núcleo em C com {NUCLEOS} núcleos' if nativo.ok else 'JavaScript (sem o mdsim para este sistema)'
    aviso(f'{TITULO}: física do Marshall e do giratório em {motor}.')
    try:
        import webview
    except ImportError:
        webview = None
        aviso('pywebview não está instalado (pip install pywebview); usando o navegador.')
    if webview is None or '--browser' in sys.argv[1:]:
        aviso(f'{TITULO}: abrindo {url} no navegador. Feche com Ctrl+C.')
        threading.Timer(0.5, webbrowser.open, (url,)).start()
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            pass
        srv.shutdown()
        return
    api = Api()
    api._janela = webview.create_window(TITULO, url, js_api=api, width=1440, height=920, min_size=(900, 640))
    webview.start()
    srv.shutdown()


if __name__ == '__main__':
    main()
