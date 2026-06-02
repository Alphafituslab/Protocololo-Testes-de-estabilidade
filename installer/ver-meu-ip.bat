@echo off
  chcp 65001 >nul
  title Alphafitus - Meu IP na Rede

  echo  ╔══════════════════════════════════════════════════════╗
  echo  ║     ENDERECOS PARA ACESSO NA REDE LOCAL              ║
  echo  ╚══════════════════════════════════════════════════════╝
  echo.
  echo  Outros computadores na mesma rede podem acessar em:
  echo.

  for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
      set IP=%%a
      set IP=!IP: =!
      echo    http://!IP!
  )

  echo.
  echo  Instrucoes para os usuarios:
  echo  1. Conecte ao mesmo Wi-Fi ou rede desta maquina
  echo  2. Abra o navegador e acesse o endereco acima
  echo  3. Faca login com seu usuario e senha
  echo.
  pause
  