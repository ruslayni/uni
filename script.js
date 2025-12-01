// script.js — Повна логіка від посилання + мобільна навігація (виправлений)

const STORE_KEY_PREFIX = 'pf_demo_v3_';

function saveUserData(username, data) { localStorage.setItem(STORE_KEY_PREFIX + username, JSON.stringify(data)); }
function loadUserData(username) { const raw = localStorage.getItem(STORE_KEY_PREFIX + username); return raw ? JSON.parse(raw) : null; }

let currentUser = null;

function createUser(username, password) {
  if (loadUserData(username)) throw new Error('Користувач вже існує');
  const user = { username, passwordHash: hash(password), cards: [], transactions: [], rules: [], createdAt: new Date().toISOString() };
  saveUserData(username, user);
  return user;
}

function loginUser(username, password) {
  const u = loadUserData(username);
  if (!u) throw new Error('Користувача не знайдено');
  if (u.passwordHash !== hash(password)) throw new Error('Невірний пароль');
  return u;
}

function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; } return 'h' + Math.abs(h); }

function uid(prefix = 'id') { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
function fmtAmount(a) { return Number(a).toFixed(2); }
function todayISO(d = new Date()) { return d.toISOString().slice(0, 10); }

/* UI Elements — обережно: деякі елементи можуть бути відсутніми на сторінці */
const authSection = document.getElementById('auth');
const appSection = document.getElementById('app');
const bottomNav = document.getElementById('bottom-nav');
const userDisplay = document.getElementById('user-display');
const userDisplayProfile = document.getElementById('user-display-profile');
const txTable = document.getElementById('tx-table');
const cardsList = document.getElementById('cards-list');
const txCardSelect = document.getElementById('tx-card');
const rulesList = document.getElementById('rules-list');
const smsText = document.getElementById('sms-text');
const chartBalanceEl = document.getElementById('chart-balance');
const chartCatsEl = document.getElementById('chart-cats');
const modals = document.getElementById('modals');
const txFilter = document.getElementById('tx-filter');
const authAlert = document.getElementById('auth-alert');

/* Charts (safely init only if canvas exists) */
let chartBalance = null, chartCats = null;
function initCharts() {
  try {
    if (chartBalance) chartBalance.destroy();
    if (chartCats) chartCats.destroy();
    if (chartBalanceEl && chartBalanceEl.getContext) {
      const ctx = chartBalanceEl.getContext('2d');
      chartBalance = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Баланс', data: [], fill: true, tension: 0.4 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } }
      });
    }
    if (chartCatsEl && chartCatsEl.getContext) {
      const ctx2 = chartCatsEl.getContext('2d');
      chartCats = new Chart(ctx2, {
        type: 'pie',
        data: { labels: [], datasets: [{ data: [], backgroundColor: ['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7', '#ec4899'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 12 } } } } }
      });
    }
  } catch (e) {
    console.warn('Chart init error', e);
  }
}
initCharts();

/* Render Functions */
function renderAll() {
  if (!currentUser) return;
  if (userDisplay) userDisplay.textContent = currentUser.username;
  if (userDisplayProfile) userDisplayProfile.textContent = currentUser.username;
  renderCards();
  renderRules();
  renderTxTable();
  renderCharts();
  updateTxCardOptions();
}

function renderCards() {
  if (!cardsList) return;
  cardsList.innerHTML = '';
  if (!currentUser || currentUser.cards.length === 0) { cardsList.innerHTML = '<div class="muted center">Немає карток</div>'; return; }
  currentUser.cards.forEach(c => {
    const el = document.createElement('div');
    el.className = 'row space-between';
    el.style.margin = '6px 0';
    el.innerHTML = `<div class="pill"><i class="fas fa-credit-card"></i> ${escapeHtml(c.name)}</div><button class="btn-ghost" data-id="${c.id}" data-act="del-card"><i class="fas fa-trash"></i> Видалити</button>`;
    cardsList.appendChild(el);
  });
}

function renderRules() {
  if (!rulesList) return;
  rulesList.innerHTML = '';
  if (!currentUser || currentUser.rules.length === 0) { rulesList.innerHTML = '<div class="muted center">Немає правил</div>'; return; }
  currentUser.rules.forEach(r => {
    const el = document.createElement('div');
    el.className = 'rule';
    el.innerHTML = `<div style="flex:1"><i class="fas fa-tag"></i> Якщо містить "<strong">${escapeHtml(r.keyword)}</strong>" → <strong>${escapeHtml(r.category)}</strong></div><button class="btn-ghost" data-act="del-rule" data-id="${r.id}"><i class="fas fa-trash"></i></button>`;
    rulesList.appendChild(el);
  });
}

function renderTxTable(filter = '') {
  if (!txTable) return;
  txTable.innerHTML = '';
  if (!currentUser) return;
  const txs = currentUser.transactions.slice().sort((a, b) => new Date(b.date) - new Date(a.date))
    .filter(tx => (tx.description || '').toLowerCase().includes(filter.toLowerCase()) || ((tx.category||'').toLowerCase().includes(filter.toLowerCase())));
  if (txs.length === 0) { txTable.innerHTML = '<tr><td colspan="6" class="muted center">Немає транзакцій</td></tr>'; return; }
  txs.forEach(tx => {
    const tr = document.createElement('tr');
    const sign = tx.type === 'expense' ? '-' : '+';
    const color = tx.type === 'expense' ? 'color: var(--error);' : 'color: var(--success);';
    tr.innerHTML = `<td>${escapeHtml(tx.date)}</td><td>${escapeHtml(tx.description || '')}</td><td>${escapeHtml(tx.category || 'Без категорії')}</td><td style="${color}">${sign}${fmtAmount(tx.amount)}</td><td>${escapeHtml(tx.card || 'Без карти')}</td><td class="actions"><button class="btn-ghost" data-act="edit-tx" data-id="${tx.id}"><i class="fas fa-edit"></i></button><button class="btn-ghost" data-act="del-tx" data-id="${tx.id}"><i class="fas fa-trash"></i></button></td>`;
    txTable.appendChild(tr);
  });
}

function renderCharts() {
  if (!currentUser) return;
  const txs = currentUser.transactions.slice();
  const monthMap = {};
  txs.forEach(tx => {
    const m = (tx.date || todayISO()).slice(0, 7);
    monthMap[m] = (monthMap[m] || 0) + (tx.type === 'income' ? Number(tx.amount) : -Number(tx.amount));
  });
  const labels = Object.keys(monthMap).sort();
  const data = [];
  let cum = 0;
  labels.forEach(l => { cum += monthMap[l]; data.push(Number(fmtAmount(cum))); });
  if (chartBalance) {
    chartBalance.data.labels = labels;
    chartBalance.data.datasets[0].data = data;
    chartBalance.update();
  }

  const catMap = {};
  txs.filter(tx => tx.type === 'expense').forEach(tx => {
    const c = tx.category || 'Інше';
    catMap[c] = (catMap[c] || 0) + Number(tx.amount);
  });
  const catLabels = Object.keys(catMap);
  const catData = catLabels.map(l => catMap[l]);
  if (chartCats) {
    chartCats.data.labels = catLabels;
    chartCats.data.datasets[0].data = catData;
    chartCats.update();
  }

  const bal = txs.reduce((s, tx) => s + (tx.type === 'income' ? Number(tx.amount) : -Number(tx.amount)), 0);
  const balEl = document.getElementById('today-balance');
  if (balEl) balEl.textContent = `Баланс: ${fmtAmount(bal)} грн`;
}

function updateTxCardOptions() {
  if (!txCardSelect) return;
  txCardSelect.innerHTML = '<option value="">Без карти</option>';
  if (!currentUser) return;
  currentUser.cards.forEach(c => {
    const o = document.createElement('option');
    o.value = c.name;
    o.textContent = c.name;
    txCardSelect.appendChild(o);
  });
}

/* Modal Helper */
function showModal(title, content, onSave = null) {
  if (!modals) return null;
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div class="modal-content"><span class="close">&times;</span><div class="h1">${escapeHtml(title)}</div>${content}<div class="row" style="margin-top:12px;"><button class="btn" id="modal-save"><i class="fas fa-save"></i> Зберегти</button><button class="btn-ghost" id="modal-cancel"><i class="fas fa-times"></i> Скасувати</button></div></div>`;
  modals.appendChild(modal);
  modal.querySelector('.close').addEventListener('click', () => modal.remove());
  modal.querySelector('#modal-cancel').addEventListener('click', () => modal.remove());
  if (onSave) modal.querySelector('#modal-save').addEventListener('click', () => { onSave(); modal.remove(); });
  return modal;
}

/* Alert Helper */
function showAlert(el, msg, type) {
  if (!el) return alert(msg);
  el.textContent = msg;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

/* Utilities */
function escapeHtml(s) { return String(s || '').replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c])); }

/* Event Listeners */
const btnRegister = document.getElementById('btn-register');
if (btnRegister) btnRegister.addEventListener('click', () => {
  const uEl = document.getElementById('login-username');
  const pEl = document.getElementById('login-password');
  const u = uEl ? uEl.value.trim() : '';
  const p = pEl ? pEl.value : '';
  try {
    if (!u || !p) throw new Error('Заповніть поля');
    createUser(u, p);
    showAlert(authAlert, 'Користувач створений. Увійдіть.', 'success');
  } catch (e) { showAlert(authAlert, e.message, 'error'); }
});

const btnLogin = document.getElementById('btn-login');
if (btnLogin) btnLogin.addEventListener('click', () => {
  const u = (document.getElementById('login-username') || {}).value.trim() || '';
  const p = (document.getElementById('login-password') || {}).value || '';
  try {
    currentUser = loginUser(u, p);
    if (authSection) authSection.classList.add('hidden');
    if (appSection) appSection.classList.remove('hidden');
    if (bottomNav) bottomNav.classList.remove('hidden');
    renderAll();
    showTab('tab-dashboard');
  } catch (e) { showAlert(authAlert, e.message, 'error'); }
});

const btnLogout = document.getElementById('btn-logout');
if (btnLogout) btnLogout.addEventListener('click', () => {
  if (currentUser) saveUserData(currentUser.username, currentUser);
  currentUser = null;
  if (authSection) authSection.classList.remove('hidden');
  if (appSection) appSection.classList.add('hidden');
  if (bottomNav) bottomNav.classList.add('hidden');
  tabHistory = [];
  const bbtn = document.getElementById('btn-back');
  if (bbtn) bbtn.classList.add('hidden');
  const pass = document.getElementById('login-password');
  if (pass) pass.value = '';
});

/* Demo data */
const btnSample = document.getElementById('btn-sample');
if (btnSample) btnSample.addEventListener('click', () => {
  const u = document.getElementById('login-username').value.trim() || 'demo';
  const p = document.getElementById('login-password').value || 'demo';
  if (!loadUserData(u)) {
    const user = {
      username: u,
      passwordHash: hash(p),
      cards: [{ id: uid('card'), name: 'Monobank' }, { id: uid('card'), name: 'PrivatBank' }],
      transactions: [
        { id: uid('tx'), date: todayISO(), description: 'Зарплата', amount: 15000, type: 'income', category: 'Зарплата', card: 'Monobank' },
        { id: uid('tx'), date: todayISO(), description: 'Покупка в АТБ', amount: 245.7, type: 'expense', category: 'Продукти', card: 'PrivatBank' },
        { id: uid('tx'), date: todayISO(), description: 'Кава', amount: 45.5, type: 'expense', category: 'Їжа', card: 'Monobank' }
      ],
      rules: [{ id: uid('rule'), keyword: 'АТБ', category: 'Продукти' }, { id: uid('rule'), keyword: 'зарплат', category: 'Зарплата' }, { id: uid('rule'), keyword: 'кава', category: 'Їжа' }]
    };
    saveUserData(u, user);
    showAlert(authAlert, 'Демо-дані створені. Увійдіть.', 'success');
    document.getElementById('login-username').value = u;
    document.getElementById('login-password').value = p;
  } else {
    showAlert(authAlert, 'Користувач вже існує.', 'error');
  }
});

/* Cards & rules */
const btnAddCard = document.getElementById('btn-add-card');
if (btnAddCard) btnAddCard.addEventListener('click', () => {
  const name = (document.getElementById('card-name') || {}).value.trim();
  if (!name) return alert('Вкажіть назву');
  currentUser.cards.push({ id: uid('card'), name });
  saveUserData(currentUser.username, currentUser);
  document.getElementById('card-name').value = '';
  renderAll();
});

const btnAddRule = document.getElementById('btn-add-rule');
if (btnAddRule) btnAddRule.addEventListener('click', () => {
  const k = (document.getElementById('rule-keyword') || {}).value.trim();
  const c = (document.getElementById('rule-category') || {}).value.trim();
  if (!k || !c) return alert('Заповніть поля');
  currentUser.rules.push({ id: uid('rule'), keyword: k, category: c });
  saveUserData(currentUser.username, currentUser);
  document.getElementById('rule-keyword').value = '';
  document.getElementById('rule-category').value = '';
  renderAll();
});

/* Delegated click handler (works if click hits inner icon etc.) */
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-act]');
  if (!target) return;
  const act = target.dataset.act;
  const id = target.dataset.id;
  if (act === 'del-card') {
    if (!confirm('Видалити картку?')) return;
    currentUser.cards = currentUser.cards.filter(c => c.id !== id);
    saveUserData(currentUser.username, currentUser);
    renderAll();
  } else if (act === 'del-rule') {
    currentUser.rules = currentUser.rules.filter(r => r.id !== id);
    saveUserData(currentUser.username, currentUser);
    renderAll();
  } else if (act === 'del-tx') {
    if (!confirm('Видалити транзакцію?')) return;
    currentUser.transactions = currentUser.transactions.filter(t => t.id !== id);
    saveUserData(currentUser.username, currentUser);
    renderAll();
  } else if (act === 'edit-tx') {
    const tx = currentUser.transactions.find(t => t.id === id);
    if (!tx) return;
    const content = `
      <select id="edit-type"><option value="expense" ${tx.type === 'expense' ? 'selected' : ''}>Витрата</option><option value="income" ${tx.type === 'income' ? 'selected' : ''}>Дохід</option></select>
      <input id="edit-amount" type="number" step="0.01" value="${tx.amount}" placeholder="Сума" />
      <input id="edit-desc" type="text" value="${escapeHtml(tx.description)}" placeholder="Опис" />
      <select id="edit-card">${txCardSelect ? txCardSelect.innerHTML : '<option value="">Без карти</option>'}</select>
      <input id="edit-date" type="date" value="${tx.date}" />
      <input id="edit-cat" type="text" value="${escapeHtml(tx.category || '')}" placeholder="Категорія" />`;
    const modal = showModal('Редагувати транзакцію', content, () => {
      const newType = document.getElementById('edit-type').value;
      const newAmount = parseFloat(document.getElementById('edit-amount').value);
      const newDesc = document.getElementById('edit-desc').value.trim();
      const newCard = document.getElementById('edit-card').value;
      const newDate = document.getElementById('edit-date').value || todayISO();
      const newCat = document.getElementById('edit-cat').value.trim();
      if (isNaN(newAmount) || newAmount <= 0) return alert('Некоректна сума');
      tx.type = newType;
      tx.amount = newAmount;
      tx.description = newDesc;
      tx.card = newCard;
      tx.date = newDate;
      tx.category = newCat;
      saveUserData(currentUser.username, currentUser);
      renderAll();
    });
    if (modal) modal.querySelector('#edit-card').value = tx.card || '';
  }
});

/* Add transaction */
const btnSaveTx = document.getElementById('btn-save-tx');
if (btnSaveTx) btnSaveTx.addEventListener('click', () => {
  const type = (document.getElementById('tx-type') || {}).value;
  const amount = parseFloat((document.getElementById('tx-amount') || {}).value);
  const desc = (document.getElementById('tx-desc') || {}).value.trim();
  const card = (document.getElementById('tx-card') || {}).value;
  const date = (document.getElementById('tx-date') || {}).value || todayISO();
  const cat = (document.getElementById('tx-cat') || {}).value.trim();
  if (isNaN(amount) || amount <= 0 || !desc) return alert('Заповніть суму та опис');
  const newTx = { id: uid('tx'), date, description: desc, amount, type, category: cat, card };
  applyRulesToTx(newTx);
  currentUser.transactions.push(newTx);
  saveUserData(currentUser.username, currentUser);
  resetQuickForm();
  renderAll();
});

function resetQuickForm() {
  const ids = ['tx-amount','tx-desc','tx-date','tx-cat','tx-card','tx-type'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) { if (id==='tx-type') el.value='expense'; else el.value=''; } });
}

const btnResetTx = document.getElementById('btn-reset-tx');
if (btnResetTx) btnResetTx.addEventListener('click', resetQuickForm);

const btnAddTransaction = document.getElementById('btn-add-transaction');
if (btnAddTransaction) btnAddTransaction.addEventListener('click', () => {
  const desc = document.getElementById('tx-desc');
  if (desc) desc.focus();
});

/* SMS parse */
function parseSmsTextBlock(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const parsed = [];
  lines.forEach(line => {
    const amountMatch = line.match(/(\d+[.,]?\d*)\s*(грн|uah|usd|eur)?/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;
    if (!amount && amount !== 0) return;
    const isIncome = /(надходж|поповн|заведен|зарплат|виплат|income|deposit)/i.test(line);
    const type = isIncome ? 'income' : 'expense';
    const desc = line.replace(/(\d+[.,]?\d*)\s*(грн|uah|usd|eur)?/gi, '').replace(/баланс:\s*\d+[.,]?\d*/i, '').trim();
    parsed.push({ description: desc || line, amount, type });
  });
  return parsed;
}

function applyRulesToTx(tx) {
  if (!currentUser) return;
  for (const r of currentUser.rules) {
    if ((tx.description || '').toLowerCase().includes((r.keyword || '').toLowerCase())) {
      tx.category = r.category;
      break;
    }
  }
}

const btnParseSms = document.getElementById('btn-parse-sms');
if (btnParseSms) btnParseSms.addEventListener('click', () => {
  const text = (smsText || {}).value?.trim();
  if (!text) return alert('Вставте текст');
  const parsed = parseSmsTextBlock(text);
  if (parsed.length === 0) return alert('Не знайдено транзакцій');
  parsed.forEach(p => {
    const newTx = { id: uid('tx'), date: todayISO(), description: p.description, amount: p.amount, type: p.type, category: '', card: '' };
    applyRulesToTx(newTx);
    currentUser.transactions.push(newTx);
  });
  saveUserData(currentUser.username, currentUser);
  if (smsText) smsText.value = '';
  renderAll();
  alert(`Імпортовано ${parsed.length} транзакцій`);
});

const btnSimulateSms = document.getElementById('btn-simulate-sms');
if (btnSimulateSms) btnSimulateSms.addEventListener('click', () => {
  const samples = [
    'Покупка 153.20 грн в АТБ. Баланс: 2004.55',
    'Надходження 15000 грн. Зарплата',
    'Оплата 89.50 грн - Кафе. Баланс: 1915.05',
    'Поповнення 500 грн від друга'
  ];
  if (smsText) smsText.value = samples[Math.floor(Math.random() * samples.length)];
});

const btnSmsPaste = document.getElementById('btn-sms-paste');
if (btnSmsPaste) btnSmsPaste.addEventListener('click', () => {
  const t = prompt('Вставте текст SMS (кілька рядків OK)');
  if (t && smsText) smsText.value = t;
});

const btnClearSms = document.getElementById('btn-clear-sms');
if (btnClearSms) btnClearSms.addEventListener('click', () => { if (smsText) smsText.value = ''; });

/* File import */
const fileImport = document.getElementById('file-import');
if (fileImport) fileImport.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const txt = reader.result;
    let imported = 0;
    if (f.name.endsWith('.json')) {
      try {
        const arr = JSON.parse(txt);
        if (Array.isArray(arr)) {
          arr.forEach(it => {
            const tx = { id: uid('tx'), date: it.date || todayISO(), description: it.description || '', amount: Number(it.amount) || 0, type: it.type || 'expense', category: it.category || '', card: it.card || '' };
            applyRulesToTx(tx);
            currentUser.transactions.push(tx);
            imported++;
          });
        }
      } catch (e) { alert('Помилка JSON'); }
    } else if (f.name.endsWith('.csv')) {
      const rows = txt.split('\n').map(r => r.trim()).filter(Boolean).slice(1);
      rows.forEach(r => {
        const cols = r.split(',');
        const tx = { id: uid('tx'), date: cols[0] || todayISO(), description: cols[1] || '', amount: parseFloat(cols[2]) || 0, type: cols[3] || 'expense', category: cols[4] || '', card: cols[5] || '' };
        applyRulesToTx(tx);
        currentUser.transactions.push(tx);
        imported++;
      });
    }
    if (imported > 0) {
      saveUserData(currentUser.username, currentUser);
      renderAll();
      alert(`Імпортовано ${imported} записів`);
    } else alert('Нічого не імпортовано');
  };
  reader.readAsText(f);
});

/* Export / restore / backup */
const btnExport = document.getElementById('btn-export');
if (btnExport) btnExport.addEventListener('click', () => {
  if (!currentUser) return alert('Немає користувача');
  const data = JSON.stringify(currentUser, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentUser.username}_pf.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const fileRestore = document.getElementById('file-restore');
if (fileRestore) fileRestore.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (!obj.username) throw new Error('Невірний файл');
      if (obj.username !== currentUser.username) {
        if (confirm('Файл для іншого користувача. Імпортувати як новий?')) {
          saveUserData(obj.username, obj);
          alert(`Імпортовано як ${obj.username}`);
        }
      } else {
        currentUser = obj;
        saveUserData(currentUser.username, currentUser);
        renderAll();
        alert('Дані відновлено');
      }
    } catch (e) { alert('Помилка JSON'); }
  };
  reader.readAsText(f);
});

const btnBackup = document.getElementById('btn-backup');
if (btnBackup) btnBackup.addEventListener('click', () => {
  const all = {};
  for (const k in localStorage) {
    if (k.startsWith(STORE_KEY_PREFIX)) all[k] = JSON.parse(localStorage.getItem(k));
  }
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pf_full_backup.json';
  a.click();
  URL.revokeObjectURL(url);
});

if (txFilter) txFilter.addEventListener('input', () => renderTxTable(txFilter.value));

/* Nav & Tabs with history */
let tabHistory = [];
let currentTab = null;

function showTab(tabId, pushHistory = true) {
  if (!tabId) return;
  // push current tab to history (if requested)
  if (pushHistory && currentTab && currentTab !== tabId) {
    tabHistory.push(currentTab);
  }

  // hide all
  document.querySelectorAll('.tab-section').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(tabId);
  if (target) target.classList.remove('hidden');

  // update nav active states (both topnav .nav-link and bottom .nav-item)
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.tab === tabId));
  document.querySelectorAll('.nav-link').forEach(item => item.classList.toggle('active', item.dataset.tab === tabId));

  currentTab = tabId;

  const backBtn = document.getElementById('btn-back');
  if (backBtn) backBtn.classList.toggle('hidden', tabHistory.length === 0);
}

function showPreviousTab() {
  if (tabHistory.length === 0) return;
  const prev = tabHistory.pop();
  showTab(prev, false);
}

/* Initialize nav listeners (bottom + top) */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const tab = item.dataset.tab;
    if (tab) showTab(tab);
  });
});
(function bindTopNavLinks(){
  const topnav = document.getElementById('topnav');
  if (!topnav) return;
  topnav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showTab(link.dataset.tab);
      // update active state handled in showTab
      topnav.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l === link));
    });
  });
})();

const backBtn = document.getElementById('btn-back');
if (backBtn) backBtn.addEventListener('click', showPreviousTab);

/* Profile logout (safe: no redirect) */
const profileLogoutBtn = document.getElementById('profile-btn-logout');
if (profileLogoutBtn) {
  profileLogoutBtn.addEventListener('click', (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try { if (currentUser) saveUserData(currentUser.username, currentUser); } catch (err) { console.warn('saveUserData failed on logout', err); }
    currentUser = null;

    if (authSection) authSection.classList.remove('hidden');
    if (appSection) appSection.classList.add('hidden');
    if (bottomNav) bottomNav.classList.add('hidden');

    const pass = document.getElementById('login-password'); if (pass) pass.value = '';
    const uname = document.getElementById('login-username'); if (uname) { uname.value = ''; uname.focus(); }

    if (typeof tabHistory !== 'undefined' && Array.isArray(tabHistory)) tabHistory.length = 0;
    const backBtn = document.getElementById('btn-back'); if (backBtn) backBtn.classList.add('hidden');

    
  });
}

/* Profile navigation buttons */
const profileBtnRules = document.getElementById('profile-btn-rules');
const profileBtnImport = document.getElementById('profile-btn-import');
const profileBtnSettings = document.getElementById('profile-btn-settings');

if (profileBtnRules) profileBtnRules.addEventListener('click', () => showTab('tab-rules'));
if (profileBtnImport) profileBtnImport.addEventListener('click', () => showTab('tab-import'));
if (profileBtnSettings) profileBtnSettings.addEventListener('click', () => showTab('tab-settings'));

/* Topnav link binding already handled above */

/* Prefill Username */
(function prefill() {
  const unameEl = document.getElementById('login-username');
  if (!unameEl) return;
  for (const k in localStorage) {
    if (k.startsWith(STORE_KEY_PREFIX)) {
      const name = k.replace(STORE_KEY_PREFIX, '');
      unameEl.value = name;
      break;
    }
  }
})();

/* Save on unload */
window.addEventListener('beforeunload', () => {
  if (currentUser) saveUserData(currentUser.username, currentUser);
});

/* Logo click -> перейти на головну (dashboard) або показати форму входу */
const headerLogo = document.querySelector('.header-logo');
if (headerLogo) {
  headerLogo.style.cursor = 'pointer';
  headerLogo.addEventListener('click', () => {
    if (currentUser) {
      if (authSection) authSection.classList.add('hidden');
      if (appSection) appSection.classList.remove('hidden');
      if (bottomNav) bottomNav.classList.remove('hidden');
      showTab('tab-dashboard');
    } else {
      if (authSection) authSection.classList.remove('hidden');
      if (appSection) appSection.classList.add('hidden');
      if (bottomNav) bottomNav.classList.add('hidden');
      const uname = document.getElementById('login-username');
      if (uname) uname.focus();
    }
  });
}

/* Ініціалізація контейнера скролу для таблиці транзакцій */
(function initTxScrollContainer(){
  const txTable = document.getElementById('tx-table');
  if (!txTable) return;
  // знайдемо найближчий блок, який є wrapper для таблиці (в index.html це div з max-height)
  let parent = txTable.closest('div');
  // якщо wrapper має ще wrapper-и (наприклад вкладені диви), знайдемо найближчий з max-height або overflow
  while (parent && getComputedStyle(parent).overflow === 'visible') {
    const maybe = parent.closest('div');
    if (!maybe || maybe === parent) break;
    parent = maybe;
  }
  if (!parent) parent = txTable.parentElement;

  // Задаємо захищені стилі, щоб не було горизонтального скролу і щоб скролбар був акуратним
  parent.classList.add('tx-scroll');
  parent.style.overflow = 'auto';
  parent.style.maxHeight = parent.style.maxHeight || '350px';
  parent.style.position = parent.style.position || 'relative';
  parent.style.webkitOverflowScrolling = 'touch';
  parent.style.scrollbarGutter = 'stable both-edges';

  // Гарантуємо, що таблиця не ширша за контейнер
  txTable.style.width = '100%';
  txTable.style.tableLayout = 'fixed';
  txTable.style.borderCollapse = 'collapse';

  // Застосуємо обрізання тексту у всіх клітинках як додатковий захист від розривів
  txTable.querySelectorAll('th, td').forEach(td => {
    td.style.overflow = 'hidden';
    td.style.textOverflow = 'ellipsis';
    td.style.whiteSpace = 'nowrap';
  });
})();
