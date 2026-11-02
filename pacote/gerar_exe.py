"""Gera o MarshallSimulator.exe (e a wheel e o zip para os colegas) no PC, com um comando só:

    python pacote/gerar_exe.py

Faz, nesta ordem: confere Git, Git LFS e Python; atualiza o repositório (git pull e git lfs pull, para trazer os exemplos);
instala as ferramentas (build, pyinstaller, pywebview); roda o build_pacote.py --exe.
Opções: --sem-git não atualiza o repositório; --so-verificar só confere os pré-requisitos e os exemplos.
Resultado: pacote/dist/MarshallSimulator.exe, a wheel em pacote/dist e o zip pacote/MarshallSimulator_<versão>.zip."""
import glob
import os
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)


def rodar(*cmd, cwd=RAIZ):
    print('>', ' '.join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


def parar(msg):
    print('\nERRO:', msg)
    sys.exit(1)


def conferir(sem_git):
    if sys.version_info < (3, 9):
        parar('precisa de Python 3.9 ou mais novo.')
    if not sem_git:
        if not shutil.which('git'):
            parar('Git não encontrado no PATH (instale o Git for Windows, que já traz o LFS).')
        if subprocess.run(['git', 'lfs', 'version'], cwd=RAIZ, capture_output=True).returncode != 0:
            parar('Git LFS não encontrado: reinstale o Git for Windows ou rode "git lfs install" depois de instalar o LFS.')


def exemplos_ok():
    arqs = glob.glob(os.path.join(RAIZ, 'exemplos', '*.mdres.gz'))
    if not arqs:
        parar('a pasta exemplos/ não tem arquivos .mdres.gz: rode "git lfs pull" (ou copie a pasta exemplos/ do vid1).')
    ponteiros = [a for a in arqs if os.path.getsize(a) < 1024]
    if ponteiros:
        parar(f'{len(ponteiros)} exemplo(s) vieram só como ponteiro do Git LFS: rode "git lfs install" e "git lfs pull".')
    print(f'exemplos: {len(arqs)} arquivos, {sum(os.path.getsize(a) for a in arqs) / 1e6:.0f} MB')


def main():
    args = sys.argv[1:]
    sem_git = '--sem-git' in args
    conferir(sem_git)
    if not sem_git:
        rodar('git', 'lfs', 'install')
        rodar('git', 'pull')
        rodar('git', 'lfs', 'pull')
    exemplos_ok()
    if '--so-verificar' in args:
        print('pré-requisitos e exemplos conferidos.')
        return
    rodar(sys.executable, '-m', 'pip', 'install', '--quiet', '--upgrade', 'build', 'pyinstaller', 'pywebview')
    rodar(sys.executable, os.path.join(AQUI, 'build_pacote.py'), '--exe')
    exe = os.path.join(AQUI, 'dist', 'MarshallSimulator.exe')
    print('\nPronto.')
    print('EXE:', exe if os.path.exists(exe) else '(não gerado: veja as mensagens acima)')
    print('Zip para os colegas:', ', '.join(glob.glob(os.path.join(AQUI, 'MarshallSimulator_*.zip'))) or '(não gerado)')


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as e:
        parar(f'o comando falhou (código {e.returncode}): {" ".join(map(str, e.cmd))}')
