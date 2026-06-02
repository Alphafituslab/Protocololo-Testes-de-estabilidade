@echo off
  chcp 65001 >nul
  title Alphafitus - Iniciando...
  color 0A

  echo  Iniciando Alphafitus...
  docker compose up -d
  if errorlevel 1 (
      echo  [ERRO] Falha ao iniciar. Verifique se o Docker Desktop esta aberto.
      pause
      exit /b 1
  )
  echo  Sistema iniciado! Abrindo navegador...
  timeout /t 3 /nobreak >nul
  start http://localhost
  