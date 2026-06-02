@echo off
  chcp 65001 >nul
  title Alphafitus - Parando...
  color 0C

  echo  Parando Alphafitus...
  docker compose down
  echo  Sistema parado.
  pause
  