@echo off
  chcp 65001 >nul
  echo.
  echo  ╔══════════════════════════════════════════════════════╗
  echo  ║   Endereco para acesso na rede local:               ║
  echo  ╚══════════════════════════════════════════════════════╝
  echo.
  for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo    http://%%a
  echo.
  echo  Compartilhe este endereco com os outros usuarios da rede.
  echo  Esta maquina deve estar ligada para o acesso funcionar.
  echo.
  pause
  