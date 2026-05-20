# Quick Start Guide - Portale dell'Automobilista

## 🚀 Start in 5 Minutes

### Prerequisites
- Node.js 14+ installed
- Python 3 or http-server
- Two terminal windows

### Step 1: Install Backend Dependencies
```bash
cd backend
npm install
```

### Step 2: Start Backend Server
```bash
cd backend
npm start
```

**Expected Output:**
```
🚗 Portale Automobilista Backend running on port 3000
SPID/CIE Authentication enabled
```

### Step 3: Start Frontend Server (New Terminal)
```bash
cd frontend
python3 -m http.server 5500
```

**Or use Node:**
```bash
cd frontend
npx http-server -p 5500
```

### Step 4: Open in Browser
```
http://localhost:5500/login.html
```

---

## 🔐 Test Login

### SPID Login
1. Click **"Accedi con SPID"**
2. Fill form:
   - Nome: `Mario`
   - Cognome: `Rossi`
   - Codice Fiscale: `RSSMRA80A01H501U`
   - Email: `mario.rossi@email.com`
3. Click **"Accedi con SPID"**

### CIE Login
1. Click **"Accedi con CIE"**
2. Fill form:
   - Nome: `Luigi`
   - Cognome: `Bianchi`
   - Codice Fiscale: `BNCLGU85B12H501K`
   - Email: `luigi.bianchi@email.com`
3. Click **"Accedi con CIE"**

---

## 🐳 Docker Quick Start (Alternative)

### One Command Setup
```bash
docker-compose up -d
```

### Access Application
```
http://localhost:5500/login.html
```

### Stop Services
```bash
docker-compose down
```

---

## 📁 Project Structure

```
Bernard-1/
├── backend/
│   ├── server.js              ← Main API server
│   ├── package.json
│   └── .env
├── frontend/
│   ├── login.html             ← Login page
│   ├── dashboard.html         ← User dashboard
│   ├── css/
│   │   ├── login.css
│   │   └── dashboard.css
│   └── js/
│       ├── login.js
│       └── dashboard.js
├── README.md                  ← Full documentation
├── API_DOCUMENTATION.md       ← API reference
├── docker-compose.yml         ← Docker setup
└── Dockerfile                 ← Backend container
```

---

## ✅ Verify Setup

### Check Backend Health
```bash
curl http://localhost:3000/api/health
```

**Expected Response:**
```json
{"status":"OK","timestamp":"2024-01-15T10:30:45.123Z"}
```

### Test SPID Login API
```bash
curl -X POST http://localhost:3000/api/auth/spid-login \
  -H "Content-Type: application/json" \
  -d '{
    "taxId": "RSSMRA80A01H501U",
    "firstName": "Mario",
    "lastName": "Rossi",
    "email": "mario.rossi@email.com"
  }'
```

---

## 🎨 Features Implemented

✅ **SPID Authentication** - Italian digital identity  
✅ **CIE Authentication** - Electronic ID card  
✅ **JWT Tokens** - Secure token-based auth  
✅ **Dashboard** - User profile & vehicles  
✅ **Responsive Design** - Mobile & desktop  
✅ **Italian UI** - Full Italian localization  
✅ **Session Management** - Secure cookies  
✅ **Error Handling** - User-friendly messages  

---

## 🔧 Troubleshooting

### "Can't connect to backend"
```bash
# Check if backend is running
curl http://localhost:3000/api/health

# If not, start backend
cd backend && npm start
```

### "Port already in use"
```bash
# Backend (3000)
npm start -- --port 3001

# Frontend
python3 -m http.server 5501
```

### "Module not found"
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
npm start
```

---

## 📚 Documentation

- **README.md** - Complete documentation
- **API_DOCUMENTATION.md** - API endpoints reference
- **API comments** - In-code documentation

---

## 🚢 Deployment

### Using Docker
```bash
docker-compose up -d
```

### Using Heroku
```bash
heroku create portale-automobilista
git push heroku main
```

### Using AWS Lambda + S3
```bash
# Backend: Deploy to Lambda
# Frontend: Deploy to S3 + CloudFront
```

---

## 🔐 Production Checklist

- [ ] Change JWT_SECRET in .env
- [ ] Enable HTTPS/TLS
- [ ] Update CORS origins
- [ ] Connect real database
- [ ] Implement rate limiting
- [ ] Add logging system
- [ ] Set up monitoring
- [ ] Regular security audits
- [ ] Enable authentication MFA
- [ ] Real SPID/CIE provider integration

---

## 📞 Support Resources

- **SPID**: https://www.spid.gov.it/
- **CIE**: https://www.cartaidentita.interno.gov.it/
- **Real Portal**: https://www.ilportaledellautomobilista.it/

---

## 🎓 Learning Resources

- Express.js: https://expressjs.com/
- JWT Auth: https://jwt.io/
- REST API Design: https://restfulapi.net/
- Italian Government APIs: https://developers.italia.it/

---

**Status**: ✅ Ready to Deploy  
**Version**: 1.0.0  
**Last Updated**: January 2024
