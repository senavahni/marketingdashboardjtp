@echo off
setlocal
title Marketing Dashboard - Start

rem ============================================================
rem  Menjalankan semua layanan secara berurutan:
rem  PostgreSQL -> Redis -> Backend -> Frontend
rem  Redis, backend, dan frontend masing-masing dibuka di jendela sendiri.
rem  Hentikan semuanya dengan stop-all.bat
rem ============================================================

rem Folder PortableDev = dua tingkat di atas folder project ini
for %%I in ("%~dp0..\..") do set "PORTABLE=%%~fI"
set "PROJECT=%~dp0"
if "%PROJECT:~-1%"=="\" set "PROJECT=%PROJECT:~0,-1%"

set "NODE_HOME=%PORTABLE%\node"
set "PG_HOME=%PORTABLE%\postgres\pgsql"
set "PG_DATA=%PORTABLE%\pgdata"
set "PG_LOG=%PORTABLE%\postgres.log"
set "PG_PORT=5432"
set "REDIS_HOME=%PORTABLE%\redis"
set "REDIS_PORT=6379"
set "BACKEND_PORT=3000"
set "FRONTEND_PORT=5173"

if not exist "%NODE_HOME%\node.exe" (
    echo ERROR: node.exe tidak ditemukan di %NODE_HOME%
    goto FAIL
)
rem Jendela backend/frontend mewarisi PATH ini (sama seperti start-node.bat)
set "PATH=%NODE_HOME%;%PATH%"

echo ========================================
echo   MARKETING DASHBOARD - START
echo ========================================
echo.

rem ---------- 1. PostgreSQL ----------
echo [1/4] PostgreSQL
"%PG_HOME%\bin\pg_ctl.exe" -D "%PG_DATA%" status >nul 2>&1
if not errorlevel 1 (
    echo       sudah berjalan.
) else (
    "%PG_HOME%\bin\pg_ctl.exe" -D "%PG_DATA%" -l "%PG_LOG%" -o "-p %PG_PORT%" -w start
    if errorlevel 1 (
        echo ERROR: PostgreSQL gagal start. Cek log: %PG_LOG%
        goto FAIL
    )
)
echo.

rem ---------- 2. Redis ----------
echo [2/4] Redis
call :REDIS_UP
if not errorlevel 1 (
    echo       sudah berjalan.
) else (
    start "Marketing Redis" /D "%REDIS_HOME%" cmd /k "title Marketing Redis && redis-server.exe --bind 127.0.0.1 --port %REDIS_PORT%"
    call :WAIT_REDIS
    if errorlevel 1 (
        echo ERROR: Redis tidak merespons. Cek jendela "Marketing Redis".
        goto FAIL
    )
    echo       berjalan di port %REDIS_PORT%.
)
echo.

rem ---------- 3. Backend ----------
echo [3/4] Backend
call :PORT_IN_USE %BACKEND_PORT%
if not errorlevel 1 (
    echo       port %BACKEND_PORT% sudah dipakai, backend dianggap sudah berjalan.
) else (
    start "Marketing Backend" /D "%PROJECT%\backend" cmd /k "title Marketing Backend && npm.cmd run dev"
    echo       menunggu backend siap - build pertama bisa makan waktu...
    call :WAIT_PORT %BACKEND_PORT% 120
    if errorlevel 1 (
        echo       PERINGATAN: backend belum siap setelah 120 detik, cek jendela "Marketing Backend".
    ) else (
        echo       berjalan di http://localhost:%BACKEND_PORT%
    )
)
echo.

rem ---------- 4. Frontend ----------
echo [4/4] Frontend
call :PORT_IN_USE %FRONTEND_PORT%
if not errorlevel 1 (
    echo       port %FRONTEND_PORT% sudah dipakai, frontend dianggap sudah berjalan.
) else (
    start "Marketing Frontend" /D "%PROJECT%\frontend" cmd /k "title Marketing Frontend && npm.cmd run dev"
    call :WAIT_PORT %FRONTEND_PORT% 60
    if errorlevel 1 (
        echo       PERINGATAN: frontend belum siap setelah 60 detik, cek jendela "Marketing Frontend".
    ) else (
        echo       berjalan di http://localhost:%FRONTEND_PORT%
    )
)
echo.

echo ========================================
echo   SELESAI - buka http://localhost:%FRONTEND_PORT%
echo   Untuk menghentikan semua: stop-all.bat
echo ========================================
start "" "http://localhost:%FRONTEND_PORT%"
pause
exit /b 0

:FAIL
echo.
echo Proses gagal. Jendela akan tetap terbuka.
pause
exit /b 1

rem ---------- Helper ----------

:REDIS_UP
"%REDIS_HOME%\redis-cli.exe" -p %REDIS_PORT% ping 2>nul | findstr /b "PONG" >nul
exit /b %errorlevel%

:WAIT_REDIS
for /l %%i in (1,1,15) do (
    call :REDIS_UP && exit /b 0
    ping -n 2 127.0.0.1 >nul
)
exit /b 1

:PORT_IN_USE
netstat -ano -p tcp | findstr /r /c:":%1 .*LISTENING" >nul
exit /b %errorlevel%

:WAIT_PORT
rem %1 = port, %2 = batas waktu (detik)
for /l %%i in (1,1,%2) do (
    call :PORT_IN_USE %1 && exit /b 0
    ping -n 2 127.0.0.1 >nul
)
exit /b 1
