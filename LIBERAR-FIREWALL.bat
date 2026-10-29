@echo off
chcp 65001 >nul
rem Só é preciso se o seu amigo não conseguir abrir o endereço do Radmin.
rem Clique com o botão direito neste arquivo > "Executar como administrador".
net session >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Rode este arquivo como administrador:
  echo   botao direito ^> "Executar como administrador".
  echo.
  pause
  exit /b 1
)
netsh advfirewall firewall delete rule name="Voo Livre (porta 3000)" >nul 2>nul
netsh advfirewall firewall add rule name="Voo Livre (porta 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any
echo.
echo   Pronto! A porta 3000 foi liberada no Firewall do Windows.
echo   Para desfazer: netsh advfirewall firewall delete rule name="Voo Livre (porta 3000)"
echo.
pause
