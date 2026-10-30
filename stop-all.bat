@echo off
setlocal
title Marketing Dashboard - Stop

rem ============================================================
rem  Menghentikan semua layanan (urutan terbalik dari start-all.bat):
rem  Frontend -> Backend -> Redis -> PostgreSQL
rem ============================================================

for %%I in ("%~dp0..\..") do set "PORTABLE=%%~fI"

set "PG_HOME=%PORTABLE%\postgres\pgsql"
set "PG_DATA=%PORTABLE%\pgdata"
set "REDIS_HOME=%PORTABLE%\redis"
set "REDIS_PORT=6379"
set "BACKEND_PORT=3000"
set "FRONTEND_PORT=5173"

echo ========================================
echo   MARKETING DASHBOARD - STOP
echo ========================================
echo.

echo [1/4] Frontend
call :KILL "Marketing Frontend" %FRONTEND_PORT%

echo [2/4] Backend
call :KILL "Marketing Backend" %BACKEND_PORT%

echo [3/4] Redis
"%REDIS_HOME%\redis-cli.exe" -p %REDIS_PORT% ping 2>nul | findstr /b "PONG" >nul
if not errorlevel 1 (
    "%REDIS_HOME%\redis-cli.exe" -p %REDIS_PORT% shutdown >nul 2>&1
    "%REDIS_HOME%\redis-cli.exe" -p %REDIS_PORT% shutdown nosave >nul 2>&1
)
call :KILL "Marketing Redis" %REDIS_PORT%

echo [4/4] PostgreSQL
"%PG_HOME%\bin\pg_ctl.exe" -D "%PG_DATA%" status >nul 2>&1
if not errorlevel 1 (
    "%PG_HOME%\bin\pg_ctl.exe" -D "%PG_DATA%" stop -m fast
) else (
    echo       tidak berjalan.
)

echo.
echo ========================================
echo   SEMUA LAYANAN DIHENTIKAN
echo ========================================
pause
exit /b 0

:KILL
rem %1 = judul jendela dari start-all.bat, %2 = port
rem Tutup jendela yang dibuka start-all.bat (beserta proses node di dalamnya),
rem lalu hentikan proses apa pun yang masih memakai port tersebut.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$n = 0;" ^
  "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*title %~1 *' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>$null | Out-Null; $n++ };" ^
  "Get-NetTCPConnection -LocalPort %2 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 } | ForEach-Object { taskkill /PID $_ /T /F 2>$null | Out-Null; $n++ };" ^
  "if ($n) { '      dihentikan.' } else { '      tidak berjalan.' }"
exit /b 0
