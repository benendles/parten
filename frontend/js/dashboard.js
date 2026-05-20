const API = '/api';

let userData = null;

// ── Auth guard ────────────────────────────────────────────────────────────────
function getToken() {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = 'login.html'; return null; }
  return token;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '—';
}

// ── Populate page with API data ───────────────────────────────────────────────
function populate(data) {
  userData = data;

  // Top bar — set just the first name inside the <strong> tag
  const nameEl = document.getElementById('nome-utente');
  if (nameEl) nameEl.textContent = data.firstName;

  // Saldo Punti card
  setText('license-points', data.license.points);
  setText('points-expiry',  data.license.expiry);

  // Scadenza Patente card
  setText('license-expiry',      data.license.expiry);
  setText('license-number-text', 'Duplicabilità PATENTE DUPLICABILE DALL\'UFFICIO CENTRALE OPERATIVO - OBBLIGATORIA LA FIRMA DEL DENUNCIANTE SUL PERM. PROVV.');

  // Veicoli card
  const count = data.vehicles.length;
  setText('vehicle-count',       count);
  setText('vehicle-count-label', count === 1 ? 'Veicolo' : 'Veicoli');

  if (count > 0) {
    const v = data.vehicles[0];
    setText('vehicle-type',  v.type);
    setText('vehicle-class', 'Classe Ambientale ' + v.environmentalClass);
  }

  // Call Center code (deterministic from taxId)
  setText('call-center-num', taxIdToCode(data.taxId));
}

// Produce a stable 9-digit call-center code from the tax ID
function taxIdToCode(taxId) {
  const n = taxId.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 3), 0);
  return String(100000000 + (n % 900000000))
    .replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
}

// ── Modal open/close ─────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal() {
  document.querySelectorAll('.modal-ov').forEach(m => m.classList.remove('open'));
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Saldo Punti → Estratto conto modal ──────────────────────────────────────
function showExtract() {
  if (!userData) return;
  const body = document.getElementById('extract-modal-body');
  const pts  = userData.license.points;
  const rows = [
    { data: '15/01/2025', descrizione: 'Saldo iniziale patente',         var_punti: '+0',  saldo: pts },
    { data: '08/03/2025', descrizione: 'Conferma revisione periodica',    var_punti: '+0',  saldo: pts },
    { data: '21/04/2025', descrizione: 'Rinnovo patente Cat. B',          var_punti: '+0',  saldo: pts },
  ];
  body.innerHTML = `
    <table class="dtable">
      <thead>
        <tr>
          <th>Data</th>
          <th>Descrizione</th>
          <th style="text-align:center">Var. Punti</th>
          <th style="text-align:center">Saldo</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.data}</td>
            <td>${r.descrizione}</td>
            <td style="text-align:center;color:#0066cc;font-weight:700">${r.var_punti}</td>
            <td style="text-align:center;font-weight:700">${r.saldo}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <p style="margin-top:12px;font-size:11px;color:#888">
      Saldo corrente: <strong style="color:#0066cc">${pts} punti</strong> &mdash;
      Scadenza patente: <strong>${userData.license.expiry}</strong>
    </p>`;
  openModal('extractModal');
}

// ── Scadenza Patente → Dettagli modal ───────────────────────────────────────
function showLicense() {
  if (!userData) return;
  setText('m-name',        userData.name);
  setText('m-taxid',       userData.taxId);
  setText('m-license-num', userData.license.number);
  const cats = (userData.license.category || '').split(',').map(s => s.trim()).filter(Boolean);
  setText('m-category', (cats.length > 1 ? 'Categorie ' : 'Categoria ') + cats.join(', '));
  setText('m-expiry',      userData.license.expiry);
  setText('m-points',      userData.license.points + ' / 30');
  setText('m-auth',        userData.authMethod);
  openModal('licenseModal');
}

// ── Veicoli → Scheda veicolo modal ───────────────────────────────────────────
function showVehicle() {
  if (!userData) return;
  const body = document.getElementById('vehicle-modal-body');
  if (!userData.vehicles.length) {
    body.innerHTML = '<p style="color:#888;font-size:13px">Nessun veicolo registrato.</p>';
  } else {
    body.innerHTML = userData.vehicles.map(v => `
      <table class="dtable">
        <tr><th>Targa</th><td style="font-family:monospace;font-weight:700;letter-spacing:.05em">${v.plate}</td></tr>
        <tr><th>Marca</th><td>${v.brand}</td></tr>
        <tr><th>Modello</th><td>${v.model}</td></tr>
        <tr><th>Tipo veicolo</th><td>${v.type}</td></tr>
        <tr><th>Classe Ambientale</th><td>${v.environmentalClass}</td></tr>
        <tr><th>Stato</th><td style="color:#2e7d32;font-weight:600">&#10003; Regolare</td></tr>
      </table>
    `).join('<hr style="margin:14px 0;border:none;border-top:1px solid #eee">');
  }
  openModal('vehicleModal');
}

// ── PROFILO button → Profilo modal ───────────────────────────────────────────
function showProfilo() {
  if (!userData) return;
  setText('p-name',   userData.name);
  setText('p-taxid',  userData.taxId);
  setText('p-email',  userData.email);
  setText('p-auth',   userData.authMethod);
  setText('p-points', userData.license.points + ' punti');
  setText('p-expiry', userData.license.expiry);
  openModal('profiloModal');
}

// ── HOME button ───────────────────────────────────────────────────────────────
function goHome() {
  window.location.href = '/web/portale-automobilista';
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function handleLogout() {
  try {
    await fetch(API + '/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
  } catch (_) {}
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/web/portale-automobilista';
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const token = getToken();
  if (!token) return;

  try {
    const res = await fetch(API + '/user/dashboard', {
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    });

    if (res.status === 401) {
      localStorage.removeItem('token');
      window.location.href = 'login.html';
      return;
    }

    const result = await res.json();
    if (result.success) {
      populate(result.data);
    } else {
      console.error('Dashboard error:', result.message);
    }
  } catch (err) {
    console.error('Impossibile connettersi al server:', err);
  }
});
