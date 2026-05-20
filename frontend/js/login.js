const API = '/api';

// ── Modal ─────────────────────────────────────────────────────────────────────
function openSpidCieModal() {
    document.getElementById('spidCieModal').classList.add('open');
    document.getElementById('spid-firstname').focus();
}

function closeModal() {
    document.getElementById('spidCieModal').classList.remove('open');
    document.getElementById('spid-error').classList.remove('show');
    document.getElementById('cie-error').classList.remove('show');
}

function switchTab(tab) {
    const isSpid = tab === 'spid';
    document.getElementById('spidForm').classList.toggle('show', isSpid);
    document.getElementById('cieForm').classList.toggle('show', !isSpid);
    document.getElementById('tab-spid').classList.toggle('active', isSpid);
    document.getElementById('tab-cie').classList.toggle('active', !isSpid);
    document.getElementById('tab-spid').setAttribute('aria-selected', isSpid);
    document.getElementById('tab-cie').setAttribute('aria-selected', !isSpid);
}

// ── Shared login logic ────────────────────────────────────────────────────────
async function submitLogin(endpoint, fields, errorId) {
    const errorDiv = document.getElementById(errorId);
    errorDiv.classList.remove('show');

    const body = {};
    for (const [key, inputId] of Object.entries(fields)) {
        body[key] = document.getElementById(inputId).value.trim();
    }

    try {
        const res = await fetch(`${API}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
        });

        const result = await res.json();

        if (result.success) {
            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            window.location.href = 'dashboard.html';
        } else {
            errorDiv.textContent = result.message || 'Errore durante l\'accesso.';
            errorDiv.classList.add('show');
        }
    } catch (err) {
        errorDiv.textContent = 'Errore di connessione al server. Verificare che il backend sia avviato.';
        errorDiv.classList.add('show');
    }
}

// ── SPID handler ──────────────────────────────────────────────────────────────
function handleSPIDLogin(event) {
    event.preventDefault();
    submitLogin('auth/spid-login', {
        firstName: 'spid-firstname',
        lastName:  'spid-lastname',
        taxId:     'spid-taxid',
        email:     'spid-email',
    }, 'spid-error');
}

// ── CIE handler ───────────────────────────────────────────────────────────────
function handleCIELogin(event) {
    event.preventDefault();
    submitLogin('auth/cie-login', {
        firstName: 'cie-firstname',
        lastName:  'cie-lastname',
        taxId:     'cie-taxid',
        email:     'cie-email',
    }, 'cie-error');
}

// ── Close modal on backdrop click ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('token')) {
        window.location.href = 'dashboard.html';
    }

    document.getElementById('spidCieModal').addEventListener('click', function (e) {
        if (e.target === this) closeModal();
    });
});
