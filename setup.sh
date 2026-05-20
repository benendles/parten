#!/bin/bash

# Setup script for Portale dell'Automobilista

echo "🚗 Setting up Portale dell'Automobilista..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo "✅ npm version: $(npm -v)"
echo ""

# Setup backend
echo "📦 Setting up backend..."
cd backend
npm install

if [ $? -eq 0 ]; then
    echo "✅ Backend dependencies installed"
else
    echo "❌ Failed to install backend dependencies"
    exit 1
fi

cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "📖 QUICK START:"
echo ""
echo "1. Terminal 1 - Start Backend:"
echo "   cd backend && npm start"
echo ""
echo "2. Terminal 2 - Start Frontend:"
echo "   cd frontend && python3 -m http.server 5500"
echo ""
echo "3. Open browser:"
echo "   http://localhost:5500/login.html"
echo ""
echo "📝 Test SPID Login:"
echo "   Nome: Mario"
echo "   Cognome: Rossi"
echo "   Codice Fiscale: RSSMRA80A01H501U"
echo "   Email: mario.rossi@email.com"
echo ""
