@echo off
REM Setup script for Portale dell'Automobilista (Windows)

echo 🚗 Setting up Portale dell'Automobilista...
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install from https://nodejs.org/
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js version: %NODE_VERSION%

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✅ npm version: %NPM_VERSION%
echo.

REM Setup backend
echo 📦 Setting up backend...
cd backend
call npm install

if %errorlevel% neq 0 (
    echo ❌ Failed to install backend dependencies
    cd ..
    exit /b 1
)

echo ✅ Backend dependencies installed
cd ..

echo.
echo ✅ Setup complete!
echo.
echo 📖 QUICK START:
echo.
echo 1. Terminal 1 - Start Backend:
echo    cd backend && npm start
echo.
echo 2. Terminal 2 - Start Frontend:
echo    cd frontend && python -m http.server 5500
echo.
echo 3. Open browser:
echo    http://localhost:5500/login.html
echo.
echo 📝 Test SPID Login:
echo    Nome: Mario
echo    Cognome: Rossi
echo    Codice Fiscale: RSSMRA80A01H501U
echo    Email: mario.rossi@email.com
echo.
