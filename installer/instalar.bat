@echo off
  chcp 65001 >nul
  title Alphafitus - Instalador
  color 0A

  echo.
  echo  ╔══════════════════════════════════════════════════════╗
  echo  ║       ALPHAFITUS - INSTALADOR WINDOWS                ║
  echo  ║       Sistema Laboratorial + HPLC Simulator          ║
  echo  ╚══════════════════════════════════════════════════════╝
  echo.

  :: Verificar se Docker está instalado
  docker --version >nul 2>&1
  if errorlevel 1 (
      echo  [ERRO] Docker Desktop nao encontrado!
      echo.
      echo  Por favor instale o Docker Desktop primeiro:
      echo  https://www.docker.com/products/docker-desktop/
      echo.
      echo  Apos instalar, reinicie o computador e execute
      echo  este arquivo novamente.
      echo.
      pause
      start https://www.docker.com/products/docker-desktop/
      exit /b 1
  )

  echo  [OK] Docker Desktop encontrado.
  echo.

  :: Verificar se Docker está rodando
  docker info >nul 2>&1
  if errorlevel 1 (
      echo  [AVISO] Docker Desktop nao esta rodando.
      echo  Iniciando Docker Desktop...
      start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
      echo  Aguardando Docker iniciar (pode demorar 30-60 segundos)...
      timeout /t 30 /nobreak >nul
      docker info >nul 2>&1
      if errorlevel 1 (
          echo  [ERRO] Docker nao iniciou. Por favor abra o Docker Desktop
          echo  manualmente e execute este instalador novamente.
          pause
          exit /b 1
      )
  )

  echo  [OK] Docker Desktop esta rodando.
  echo.
  echo  Baixando e iniciando os containers Alphafitus...
  echo  (Primeira vez pode demorar 3-5 minutos para baixar as imagens)
  echo.

  :: Subir os containers
  docker compose up -d --build

  if errorlevel 1 (
      echo.
      echo  [ERRO] Falha ao iniciar os containers.
      echo  Verifique se a porta 80 nao esta em uso por outro programa.
      pause
      exit /b 1
  )

  echo.
  echo  Aguardando banco de dados inicializar...
  timeout /t 15 /nobreak >nul

  echo.
  echo  ╔══════════════════════════════════════════════════════╗
  echo  ║              INSTALACAO CONCLUIDA!                   ║
  echo  ╠══════════════════════════════════════════════════════╣
  echo  ║                                                      ║
  echo  ║  Acesse pelo navegador:                              ║
  echo  ║  • Nesta maquina:  http://localhost                  ║
  echo  ║  • Pela rede:      http://SEU-IP-LOCAL               ║
  echo  ║                                                      ║
  echo  ║  Descubra seu IP: execute ipconfig no CMD            ║
  echo  ║                                                      ║
  echo  ╚══════════════════════════════════════════════════════╝
  echo.

  :: Criar atalhos na área de trabalho
  powershell -Command "& {$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\Alphafitus.lnk'); $Shortcut.TargetPath = 'http://localhost'; $Shortcut.Save()}" >nul 2>&1

  :: Agendar backup automático
  schtasks /query /tn "AlphafitusBackup" >nul 2>&1
  if errorlevel 1 (
      echo  Configurando backup automatico diario...
      schtasks /create /tn "AlphafitusBackup" /tr "%~dp0backup-googledrive.bat" /sc daily /st 02:00 /ru SYSTEM /f >nul 2>&1
      echo  [OK] Backup agendado para todo dia as 02:00
  )

  echo.
  echo  Pressione qualquer tecla para abrir o sistema no navegador...
  pause >nul
  start http://localhost
  