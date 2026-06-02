@echo off
  chcp 65001 >nul
  title Alphafitus - Iniciando
  cd /d "%~dp0..\..
  docker compose -f installer/protocolo/docker-compose.yml --env-file installer/protocolo/.env up -d
  if errorlevel 1 ( echo Erro ao iniciar. Verifique se o Docker Desktop esta aberto. & pause & exit /b 1 )
  echo Sistema iniciado! Abrindo navegador...
  timeout /t 3 /nobreak >nul
  start http://localhost
  