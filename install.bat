@echo off
setlocal
chcp 65001 >nul

rem Установка плагина в глобальный каталог OpenCode:
rem   %USERPROFILE%\.config\opencode\plugins\compaction-slider\
rem Это каталог глобальных плагинов OpenCode V2 (серверных и TUI).
rem Если у тебя задан XDG_CONFIG_HOME, поправь CONFIG_DIR ниже.

set "SRC=%~dp0plugin"
set "CONFIG_DIR=%USERPROFILE%\.config\opencode"
set "DST=%CONFIG_DIR%\plugins\compaction-slider"

if not exist "%SRC%\index.js" (
  echo [ERROR] Не найден "%SRC%\index.js". Запусти install.bat из корня репозитория.
  pause
  exit /b 1
)

if not exist "%DST%" mkdir "%DST%"

for %%F in (index.js rpc.js settings.js tui.tsx package.json) do (
  if exist "%SRC%\%%F" xcopy "%SRC%\%%F" "%DST%\" /Y >nul
)

echo [OK] Плагин установлен в: %DST%
echo.
echo ВАЖНО: если у модели в "%CONFIG_DIR%\opencode.json" остался блок
echo providers.*.models.*.limit с полем context/input (например 222222),
echo удали context и input у этой модели - порог compaction теперь задаёт
echo плагин, а старый limit.context ломает счётчик контекста.
echo Поле limit.output удалять не нужно.
echo.
echo После установки перезапусти сервис: opencode service restart
echo Затем в TUI выбери модель и введи /ctx-percent
echo.
