@echo off
chcp 65001 >nul
setlocal
rem בונה קובץ EXE אחד מהמשחק. צריך Node.js מותקן (https://nodejs.org).
rem electron-builder לא מסתדר עם נתיבים בעברית, לכן בונים בתיקייה זמנית באנגלית.

set "SRC=%~dp0.."
set "WORK=%TEMP%\hosmim-v2-build"
echo.
echo === בונים את "חוסמים או מפנים" ===
echo תיקיית עבודה: %WORK%

if exist "%WORK%" rmdir /s /q "%WORK%"
mkdir "%WORK%\app"
copy /y "%~dp0main.js" "%WORK%\" >nul
copy /y "%~dp0package.json" "%WORK%\" >nul
copy /y "%SRC%\index.html" "%WORK%\app\" >nul
copy /y "%SRC%\fonts.css" "%WORK%\app\" >nul
copy /y "%SRC%\icon-512.png" "%WORK%\app\" >nul
copy /y "%SRC%\icon-256.png" "%WORK%\app\" >nul
copy /y "%SRC%\favicon.png" "%WORK%\app\" >nul
xcopy /e /i /q /y "%SRC%\css" "%WORK%\app\css" >nul
xcopy /e /i /q /y "%SRC%\src" "%WORK%\app\src" >nul
xcopy /e /i /q /y "%SRC%\lib" "%WORK%\app\lib" >nul
xcopy /e /i /q /y "%SRC%\fonts" "%WORK%\app\fonts" >nul

pushd "%WORK%"
echo.
echo מתקינים את כלי הבנייה (פעם ראשונה לוקח כמה דקות)...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
echo.
echo בונים את הקובץ...
call npx electron-builder --win portable
if errorlevel 1 goto fail
popd

if not exist "%~dp0dist" mkdir "%~dp0dist"
copy /y "%WORK%\dist\*.exe" "%~dp0dist\" >nul
echo.
echo === מוכן! הקובץ נמצא בתיקייה: %~dp0dist ===
explorer "%~dp0dist"
pause
exit /b 0

:fail
popd
echo.
echo *** הבנייה נכשלה. צלמו את המסך ושלחו. ***
pause
exit /b 1
