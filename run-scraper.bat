@echo off
title DevQuest Scraper
cd /d "%~dp0"

echo ============================================
echo   DevQuest (devquest.gg) - Game Dev Jobs
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] Node.js is not installed on this computer.
    echo.
    echo Opening the Node.js download page now...
    echo Install the "LTS" version, then double-click this file again.
    start https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo [OK] Node.js %NODEVER% found.
echo.
echo Fetching jobs from studio career boards...
echo.

node scrape.js

echo.
if %errorlevel% equ 0 (
    echo [OK] Done! Open index.html to browse the fresh listings.
) else (
    echo [X] Something went wrong - see the error above.
)
echo.
pause
