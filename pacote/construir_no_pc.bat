@echo off
rem Monta tudo no PC: atualiza o repositório (com os exemplos do Git LFS), gera o pacote Python (wheel), o .exe e o zip para os colegas.
rem Rode com dois cliques ou no terminal, a partir de qualquer pasta. Precisa de Git (com LFS) e Python 3.9+ no PATH.
cd /d "%~dp0\.."
git lfs install || goto erro
git pull || goto erro
git lfs pull || goto erro
python -m pip install --quiet --upgrade build pyinstaller pywebview || goto erro
python pacote\build_pacote.py --exe || goto erro
echo.
echo Pronto. Arquivos em pacote\dist (MarshallSimulator.exe e a wheel) e o zip pacote\MarshallSimulator_*.zip.
pause
exit /b 0
:erro
echo.
echo Falhou. Veja a mensagem acima.
pause
exit /b 1
