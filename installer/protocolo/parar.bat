@echo off
  chcp 65001 >nul
  title Alphafitus - Parando
  cd /d "%~dp0..\..
  docker compose -f installer/protocolo/docker-compose.yml down
  echo Sistema parado.
  pause
  