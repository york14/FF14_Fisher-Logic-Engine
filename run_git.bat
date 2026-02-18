@echo off
chcp 65001
cd /d "%~dp0"
echo Current Directory: %CD%
git add .
if %ERRORLEVEL% NEQ 0 (
    echo Git add failed
    exit /b %ERRORLEVEL%
)
git commit -m "feat(optimizer): Implement comprehensive strategy evaluation tab with bug fixes"
if %ERRORLEVEL% NEQ 0 (
    echo Git commit failed or nothing to commit
)
git push
if %ERRORLEVEL% NEQ 0 (
    echo Git push failed
    exit /b %ERRORLEVEL%
)
echo Git operations completed successfully
