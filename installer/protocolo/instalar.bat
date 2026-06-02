@echo off
  chcp 65001 >nul
  title Alphafitus - Instalador
  color 0A

  echo.
  echo  ╔══════════════════════════════════════════════════════╗
  echo  ║    ALPHAFITUS - PROTOCOLO DE ESTABILIDADE            ║
  echo  ║    Instalador Windows com Docker                     ║
  echo  ╚══════════════════════════════════════════════════════╝
  echo.

  :: ── Verificar Docker ─────────────────────────────────────────────────────────
  docker --version >nul 2>&1
  if errorlevel 1 (
      echo  [ERRO] Docker Desktop nao encontrado!
      echo.
      echo  Instale o Docker Desktop primeiro:
      echo  https://www.docker.com/products/docker-desktop/
      echo.
      start https://www.docker.com/products/docker-desktop/
      pause & exit /b 1
  )

  docker info >nul 2>&1
  if errorlevel 1 (
      echo  Iniciando Docker Desktop... aguarde 30 segundos.
      start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
      timeout /t 35 /nobreak >nul
      docker info >nul 2>&1
      if errorlevel 1 (
          echo  [ERRO] Docker nao respondeu. Abra o Docker Desktop manualmente e tente novamente.
          pause & exit /b 1
      )
  )
  echo  [OK] Docker Desktop pronto.

  :: ── Copiar .env se nao existir ────────────────────────────────────────────────
  if not exist "%~dp0.env" (
      if exist "%~dp0.env.example" (
          copy "%~dp0.env.example" "%~dp0.env" >nul
          echo  [OK] Arquivo .env criado a partir do exemplo.
          echo.
          echo  IMPORTANTE: Edite o arquivo .env para definir suas senhas antes de continuar!
          echo  Arquivo: %~dp0.env
          echo.
          notepad "%~dp0.env"
          echo  Pressione qualquer tecla APOS fechar o editor e salvar o .env...
          pause >nul
      )
  )

  :: ── Build + Subir containers ──────────────────────────────────────────────────
  echo.
  echo  Construindo e iniciando os containers...
  echo  (Primeira vez: 5-15 minutos para baixar e compilar tudo)
  echo.

  cd /d "%~dp0...."
  docker compose -f installer/protocolo/docker-compose.yml --env-file installer/protocolo/.env up -d --build

  if errorlevel 1 (
      echo  [ERRO] Falha ao iniciar. Verifique se a porta 80 nao esta em uso.
      pause & exit /b 1
  )

  :: ── Aguardar API ficar pronta ────────────────────────────────────────────────
  echo.
  echo  Aguardando o sistema inicializar...
  :wait_loop
  timeout /t 5 /nobreak >nul
  docker exec alphafitus_api wget -qO- http://localhost:8080/api/healthz >nul 2>&1
  if errorlevel 1 goto wait_loop
  echo  [OK] Sistema pronto!

  :: ── Atalho na área de trabalho ───────────────────────────────────────────────
  powershell -Command "& {$s=New-Object -COM WScript.Shell; $l=$s.CreateShortcut('%USERPROFILE%\Desktop\Alphafitus.url'); $l.TargetPath='http://localhost'; $l.Save()}" >nul 2>&1

  :: ── Agendar backup automático ─────────────────────────────────────────────────
  schtasks /query /tn "AlphafitusBackup" >nul 2>&1
  if errorlevel 1 (
      schtasks /create /tn "AlphafitusBackup" /tr "%~dp0backup-googledrive.bat" /sc daily /st 02:00 /ru SYSTEM /f >nul 2>&1
      echo  [OK] Backup agendado: todo dia as 02:00
  )

  echo.
  echo  ╔══════════════════════════════════════════════════════╗
  echo  ║              INSTALACAO CONCLUIDA!                   ║
  echo  ╠══════════════════════════════════════════════════════╣
  echo  ║  Nesta maquina:   http://localhost                   ║
  echo  ║  Pela rede:       http://SEU-IP  (veja ver-meu-ip)  ║
  echo  ╚══════════════════════════════════════════════════════╝
  echo.
  pause >nul
  start http://localhost
  