"""Janela do Marshall Simulator.

Abre a interface (web/marshall_digital_app.html) numa janela própria com o pywebview. O motor
(agregados, DEM, mastique e bolhas) roda no navegador embutido (WebView2 no Windows).
Sem o pywebview, ou com --browser, abre a mesma interface no navegador padrão.
"""
import base64
import functools
import http.server
import json
import os
import socketserver
import sys
import threading
import webbrowser

WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')
HTML = 'marshall_digital_app.html'
TITULO = 'Marshall Simulator'
DADOS = os.environ.get('MARSHALL_SIM_DIR') or os.path.join(os.path.expanduser('~'), '.marshall_simulator')
CURVAS = os.path.join(DADOS, 'minhas_curvas.json')


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


def abrir_no_navegador():
    """Alternativa sem dependências: servidor local e navegador padrão."""
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=WEB)
    handler.log_message = lambda *a: None
    with socketserver.TCPServer(('127.0.0.1', 0), handler) as srv:
        url = f'http://127.0.0.1:{srv.server_address[1]}/{HTML}'
        print(f'{TITULO}: abrindo {url} no navegador. Feche com Ctrl+C.')
        threading.Timer(0.5, webbrowser.open, (url,)).start()
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass


def main():
    if not os.path.exists(os.path.join(WEB, HTML)):
        sys.exit(f'Não encontrei {HTML} em {WEB}. Reinstale o pacote.')
    if '--browser' in sys.argv[1:]:
        abrir_no_navegador()
        return
    try:
        import webview
    except ImportError:
        print('pywebview não está instalado (pip install pywebview); usando o navegador.')
        abrir_no_navegador()
        return
    os.chdir(WEB)  # o servidor interno do pywebview serve arquivos relativos a esta pasta
    api = Api()
    api._janela = webview.create_window(TITULO, HTML, js_api=api, width=1440, height=920, min_size=(900, 640))
    webview.start(http_server=True)


if __name__ == '__main__':
    main()
