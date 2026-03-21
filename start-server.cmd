@echo off
setlocal

if exist "%ProgramFiles%\nodejs\node.exe" (
  "%ProgramFiles%\nodejs\node.exe" server.js
  goto :eof
)

if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
  "%ProgramFiles(x86)%\nodejs\node.exe" server.js
  goto :eof
)

node server.js
