@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (echo Installing packages... & call npm install)
set /p U=TikTok username (without @, blank = demo mode): 
if "%U%"=="" (start "" http://localhost:8080/?demo=1 & node server.js --demo) else (start "" http://localhost:8080/ & node server.js %U%)
