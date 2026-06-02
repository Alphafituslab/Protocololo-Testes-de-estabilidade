@echo off
  chcp 65001 >nul
  title Alphafitus - Backup Google Drive

  :: Ler caminho do Google Drive do .env
  for /f "tokens=2 delims==" %%a in ('findstr /i "GOOGLE_DRIVE_PATH" "%~dp0.env" 2^>nul') do set GDRIVE=%%a
  if "%GDRIVE%"=="" set GDRIVE=%USERPROFILE%\Google Drive\My Drive\Alphafitus-Backup

  set BACKUP_LOCAL=%~dp0..\..\backups_local
  set DATA=%date:~6,4%-%date:~3,2%-%date:~0,2%
  set HORA=%time:~0,2%%time:~3,2%
  set ARQUIVO=backup_%DATA%_%HORA%.json

  if not exist "%BACKUP_LOCAL%" mkdir "%BACKUP_LOCAL%"
  if not exist "%GDRIVE%" mkdir "%GDRIVE%" 2>nul

  echo [%date% %time%] Iniciando backup... >> "%~dp0backup.log"

  :: Chamar API de backup
  docker exec alphafitus_api wget -qO "%BACKUP_LOCAL%\%ARQUIVO%" "http://localhost:8080/api/backup/run" >nul 2>&1

  :: Alternativa: copiar arquivo mais recente do volume Docker
  for /f "delims=" %%F in ('docker exec alphafitus_api ls -t /backups ^| head -1 2^>nul') do set LATEST=%%F
  if not "%LATEST%"=="" (
      docker cp "alphafitus_api:/backups/%LATEST%" "%BACKUP_LOCAL%\%LATEST%" >nul 2>&1
      if exist "%GDRIVE%" (
          copy "%BACKUP_LOCAL%\%LATEST%" "%GDRIVE%\%LATEST%" >nul 2>&1
          echo [%date% %time%] Backup copiado para Google Drive: %LATEST% >> "%~dp0backup.log"
      )
  )

  :: Manter 30 arquivos locais
  for /f "skip=30 delims=" %%F in ('dir /b /o-d "%BACKUP_LOCAL%\*.json" 2^>nul') do del "%BACKUP_LOCAL%\%%F" >nul 2>&1
  echo [%date% %time%] Concluido >> "%~dp0backup.log"
  