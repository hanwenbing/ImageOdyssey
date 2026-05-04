@echo off
setlocal

set "NPM_OFFICIAL=C:\Program Files\nodejs\npm.cmd"
set "NPM_CMD="

if exist "%NPM_OFFICIAL%" (
    set "NPM_CMD=%NPM_OFFICIAL%"
) else (
    for /f "delims=" %%I in ('where npm.cmd 2^>nul') do (
        if not defined NPM_CMD set "NPM_CMD=%%I"
    )
)

if not defined NPM_CMD (
    echo npm.cmd was not found. Please install the official Node.js LTS from https://nodejs.org/
    set "EXIT_CODE=1"
    goto done
)

call "%NPM_CMD%" -C web run dev:all
set "EXIT_CODE=%ERRORLEVEL%"

:done
if not "%EXIT_CODE%"=="0" echo Exit code: %EXIT_CODE%
pause
exit /b %EXIT_CODE%
