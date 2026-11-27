@echo off
title Lovely Friends Club Server
echo Starting Lovely Friends Club Website & Database...
start http://localhost:3000/signin.html
node server.js
pause
