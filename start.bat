@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 首次啟動，安裝依賴套件...
  call npm install
)
start "" http://localhost:3456
node --experimental-sqlite server.js
