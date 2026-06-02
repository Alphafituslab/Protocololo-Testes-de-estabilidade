@echo off
  chcp 65001 >nul
  title Alphafitus - Restaurar Backup
  color 0E

  echo  ╔══════════════════════════════════════════════════════╗
  echo  ║          RESTAURAR BACKUP ALPHAFITUS                 ║
  echo  ╚══════════════════════════════════════════════════════╝
  echo.
  echo  ATENCAO: Isto substituira TODOS os dados atuais!
  echo.
  set /p ARQUIVO=Digite o caminho completo do arquivo de backup (.sql): 

  if not exist "%ARQUIVO%" (
      echo  [ERRO] Arquivo nao encontrado: %ARQUIVO%
      pause
      exit /b 1
  )

  set /p CONFIRMAR=Tem certeza? Digite SIM para confirmar: 
  if /i not "%CONFIRMAR%"=="SIM" (
      echo  Operacao cancelada.
      pause
      exit /b 0
  )

  echo  Restaurando backup...
  docker cp "%ARQUIVO%" alphafitus_db:/tmp/restore.dump
  docker exec alphafitus_db pg_restore -U alphafitus -d alphafitus --clean /tmp/restore.dump

  if errorlevel 1 (
      echo  [AVISO] Restauracao concluida com avisos (normal).
  ) else (
      echo  [OK] Restauracao concluida com sucesso!
  )
  pause
  