@echo off
title MiraCastR - Free Wireless Screen Mirroring Hub
cd /d "%~dp0"
echo Starting MiraCastR Wireless Display Server...
start "" "http://localhost:3000"
node server.js
pause
