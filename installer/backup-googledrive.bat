@echo off
  chcp 65001 >nul
  title Alphafitus - Backup Google Drive

  :: ════════════════════════════════════════════════════════════
  :: CONFIGURACAO DO BACKUP
  :: Altere o caminho abaixo para a pasta do Google Drive
  :: ════════════════════════════════════════════════════════════
  set GOOGLE_DRIVE=%USERPROFILE%\Google Drive\My Drive\Alphafitus-Backup
  set BACKUP_LOCAL=%~dp0backups
  set DATA=%date:~6,4%-%date:~3,2%-%date:~0,2%
  set HORA=%time:~0,2%-%time:~3,2%
  set ARQUIVO=alphafitus_backup_%DATA%_%HORA%.sql

  :: Criar pastas se nao existirem
  if not exist "%BACKUP_LOCAL%" mkdir "%BACKUP_LOCAL%"
  if not exist "%GOOGLE_DRIVE%" mkdir "%GOOGLE_DRIVE%" 2>nul

  echo [%date% %time%] Iniciando backup do banco de dados... >> "%~dp0backup.log"

  :: Fazer dump do PostgreSQL via Docker
  docker exec alphafitus_db pg_dump -U alphafitus -d alphafitus -F c -f /tmp/backup.dump >nul 2>&1

  if errorlevel 1 (
      echo [%date% %time%] ERRO: Falha ao gerar backup do banco >> "%~dp0backup.log"
      exit /b 1
  )

  :: Copiar backup do container para pasta local
  docker cp alphafitus_db:/tmp/backup.dump "%BACKUP_LOCAL%\%ARQUIVO%" >nul 2>&1

  :: Copiar para Google Drive se pasta existir
  if exist "%GOOGLE_DRIVE%" (
      copy "%BACKUP_LOCAL%\%ARQUIVO%" "%GOOGLE_DRIVE%\%ARQUIVO%" >nul 2>&1
      echo [%date% %time%] Backup salvo no Google Drive: %ARQUIVO% >> "%~dp0backup.log"
  ) else (
      echo [%date% %time%] AVISO: Pasta Google Drive nao encontrada. Backup salvo localmente. >> "%~dp0backup.log"
  )

  :: Manter apenas os ultimos 30 backups locais
  for /f "skip=30 delims=" %%F in ('dir /b /o-d "%BACKUP_LOCAL%\*.sql" 2^>nul') do del "%BACKUP_LOCAL%\%%F" >nul 2>&1

  echo [%date% %time%] Backup concluido: %ARQUIVO% >> "%~dp0backup.log"
  