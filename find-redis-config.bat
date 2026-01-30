@echo off
echo ========================================
echo Finding Redis Configuration File
echo ========================================
echo.

REM Common Redis installation paths on Windows
set PATHS[0]="C:\Program Files\Redis"
set PATHS[1]="C:\Redis"
set PATHS[2]="C:\Program Files (x86)\Redis"
set PATHS[3]="%USERPROFILE%\Redis"

echo Checking common Redis locations...
echo.

for /L %%i in (0,1,3) do (
    if exist !PATHS[%%i]!\redis.windows.conf (
        echo [FOUND] !PATHS[%%i]!\redis.windows.conf
        echo.
        echo To fix the warning:
        echo 1. Open Notepad as Administrator
        echo 2. Open: !PATHS[%%i]!\redis.windows.conf
        echo 3. Find: maxmemory-policy volatile-lru
        echo 4. Change to: maxmemory-policy noeviction
        echo 5. Save and restart Redis
        echo.
        goto :found
    )
)

echo [NOT FOUND] in common locations
echo.
echo Try running: redis-cli CONFIG GET dir
echo This will show you where Redis is running from
echo.

:found
pause
