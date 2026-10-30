"""Monta o pacote do Marshall Simulator a partir do app atual.

1. Copia ../marshall_digital_app.html para src/marshall_simulator/web/, trocando o three.js da CDN pela cópia
   local (vendor/three.min.js, r128, MIT), para o app abrir sem internet.
2. Compila o núcleo em C (../native/mdsim.c) para src/marshall_simulator/bin/ com o gcc (no Windows, o WinLibs),
   com -march=x86-64-v2 para rodar em qualquer PC x86-64 recente. Sem gcc, o pacote sai sem o mdsim e a física
   roda em JavaScript.
3. Gera o wheel e o sdist (python -m build).
4. Com --exe, gera dist/MarshallSimulator.exe com o PyInstaller (Windows, sem precisar de Python).
5. Zip para os colegas: LEIA-ME, wheel e o .exe (se gerado).

Rode na pasta pacote/:  python build_pacote.py [--exe]
Antes, rode `node build.mjs` na raiz para o HTML estar atualizado.
"""
import glob
import hashlib
import os
import re
import shutil
import subprocess
import sys
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
WEB = os.path.join(AQUI, 'src', 'marshall_simulator', 'web')
CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
THREE_SHA256 = '9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2'


def versao():
    with open(os.path.join(AQUI, 'src', 'marshall_simulator', '__init__.py'), encoding='utf-8') as f:
        return re.search(r"__version__ = '([^']+)'", f.read()).group(1)


def copiar_web():
    three = os.path.join(AQUI, 'vendor', 'three.min.js')
    with open(three, 'rb') as f:
        if hashlib.sha256(f.read()).hexdigest() != THREE_SHA256:
            sys.exit('vendor/three.min.js não é o r128 esperado')
    with open(os.path.join(RAIZ, 'marshall_digital_app.html'), encoding='utf-8') as f:
        html = f.read()
    if CDN not in html:
        sys.exit('o HTML não carrega o three.js r128 da CDN: atualize CDN em build_pacote.py')
    html = html.replace(CDN, 'three.min.js')
    os.makedirs(WEB, exist_ok=True)
    with open(os.path.join(WEB, 'marshall_digital_app.html'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    shutil.copy(three, os.path.join(WEB, 'three.min.js'))
    shutil.copy(os.path.join(AQUI, 'vendor', 'LICENSE-three.txt'), os.path.join(WEB, 'LICENSE-three.txt'))


def gcc():
    achado = shutil.which('gcc')
    if achado:
        return achado
    winlibs = glob.glob(os.path.join(os.path.expanduser('~'), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages',
                                     'BrechtSanders.WinLibs*', 'mingw64', 'bin', 'gcc.exe'))
    return winlibs[0] if winlibs else None


def compilar_mdsim():
    bindir = os.path.join(AQUI, 'src', 'marshall_simulator', 'bin')
    os.makedirs(bindir, exist_ok=True)
    nome = 'mdsim.exe' if os.name == 'nt' else 'mdsim'
    cc = gcc()
    if not cc:
        print('gcc não encontrado: o pacote sai sem o mdsim (física em JavaScript)')
        return
    env = dict(os.environ, PATH=os.path.dirname(cc) + os.pathsep + os.environ.get('PATH', ''))
    estatico = ['-static'] if os.name == 'nt' else []
    subprocess.run([cc, '-O3', '-march=x86-64-v2', '-fopenmp', *estatico, '-o', os.path.join(bindir, nome),
                    os.path.join(RAIZ, 'native', 'mdsim.c'), '-lm'], env=env, check=True)


def wheel():
    subprocess.run([sys.executable, '-m', 'build', '--outdir', 'dist'], cwd=AQUI, check=True)


def zipar(v):
    """Zip para os colegas: LEIA-ME, wheel e, se foi gerado, o .exe."""
    whl = f'marshall_simulator-{v}-py3-none-any.whl'
    exe_ = os.path.join(AQUI, 'dist', 'MarshallSimulator.exe')
    with zipfile.ZipFile(os.path.join(AQUI, f'MarshallSimulator_{v}.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(os.path.join(AQUI, 'LEIA-ME.md'), 'LEIA-ME.md')
        z.write(os.path.join(AQUI, 'dist', whl), whl)
        if os.path.exists(exe_):
            z.write(exe_, 'MarshallSimulator.exe')


def exe():
    web = os.path.join('src', 'marshall_simulator', 'web')
    subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--onefile', '--windowed',
                    '--name', 'MarshallSimulator', '--distpath', 'dist', '--workpath', 'build',
                    '--add-data', f'{web}{os.pathsep}marshall_simulator/web',
                    '--add-data', f'{os.path.join("src", "marshall_simulator", "bin")}{os.pathsep}marshall_simulator/bin',
                    '--paths', 'src', '--collect-all', 'webview', 'exe_main.py'], cwd=AQUI, check=True)


if __name__ == '__main__':
    v = versao()
    copiar_web()
    compilar_mdsim()
    wheel()
    if '--exe' in sys.argv[1:]:
        exe()
    zipar(v)
    print(f'pronto: versão {v} em {os.path.join(AQUI, "dist")}')
