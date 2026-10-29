"""Marshall Simulator — versão desktop do app Marshall Digital (método de Wan et al., 2024).

Uso:
    pip install pywebview
    python marshall_simulator.py

Abre a interface de marshall_digital_app.html numa janela própria. O motor (agregados, DEM,
mastique e bolhas) é o mesmo do app web e roda no navegador embutido (WebView2 no Windows).
Sem o pywebview, o programa abre a mesma interface no navegador padrão.

As curvas criadas em "Adicionar curva" ficam em minhas_curvas.json, nesta pasta.
A biblioteca 3D (three.js) é carregada da internet na primeira abertura.
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

AQUI = os.path.dirname(os.path.abspath(__file__))
HTML = 'marshall_digital_app.html'
CURVAS = os.path.join(AQUI, 'minhas_curvas.json')
TITULO = 'Marshall Simulator'


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
        with open(CURVAS, 'w', encoding='utf-8') as f:
            f.write(texto)
        return CURVAS

    def save_file(self, nome, b64):
        import webview
        tipo = getattr(getattr(webview, 'FileDialog', None), 'SAVE', None) or webview.SAVE_DIALOG
        caminho = self._janela.create_file_dialog(tipo, directory=AQUI, save_filename=nome)
        if not caminho:
            return ''
        if isinstance(caminho, (list, tuple)):
            caminho = caminho[0]
        with open(caminho, 'wb') as f:
            f.write(base64.b64decode(b64))
        return caminho


def abrir_no_navegador():
    """Alternativa sem dependências: servidor local e navegador padrão."""
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=AQUI)
    handler.log_message = lambda *a: None
    with socketserver.TCPServer(('127.0.0.1', 0), handler) as srv:
        url = f'http://127.0.0.1:{srv.server_address[1]}/{HTML}'
        print(f'{TITULO}: pywebview não está instalado; abrindo {url} no navegador.')
        print('Para a janela própria: pip install pywebview. Feche com Ctrl+C.')
        threading.Timer(0.5, webbrowser.open, (url,)).start()
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass


def main():
    if not os.path.exists(os.path.join(AQUI, HTML)):
        sys.exit(f'Não encontrei {HTML} ao lado deste arquivo.')
    try:
        import webview
    except ImportError:
        abrir_no_navegador()
        return
    os.chdir(AQUI)  # o servidor interno do pywebview serve arquivos relativos a esta pasta
    api = Api()
    api._janela = webview.create_window(TITULO, HTML, js_api=api, width=1440, height=920, min_size=(900, 640))
    webview.start(http_server=True)


if __name__ == '__main__':
    main()
