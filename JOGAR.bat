@echo off
chcp 65001 >nul
title Voo Livre - servidor
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js nao encontrado. Instale em https://nodejs.org e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
start "" http://localhost:3000
node server.js 3000
pause
