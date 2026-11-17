@echo off
REM Nur fuer die lokale Entwicklung.
REM Spaeter durch Docker Compose ersetzen.

cd /d "%~dp0"

docker build -t mergelens-data-collection .
if errorlevel 1 goto error

docker run --rm --env-file .env mergelens-data-collection
if errorlevel 1 goto error

pause
exit /b 0

:error
echo Docker build or run failed.
pause
exit /b 1