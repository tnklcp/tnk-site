/* =========================================================
   TNK Customer Portal (front-end demo)
   - Auth guard (customer)
   - Tabs
   - Invoices (view), Payments (balance preview), Preferences,
     Request extra service, Special requests, Comments, History,
     Availability (read-only)
   ========================================================= */

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);
  const fmtMoney = (n) => `$${(Number(n || 0)).toFixed(2)}`;
  const todayISO = () => (new Date()).toISOString().slice(0,10);

  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  };

  const KEYS = {
    invoices: 'tnk_invoices',
    availability: 'tnk_availability',
    cust_prefs: 'tnk_cust_prefs',
    cust_extras: 'tnk_cust_extras',
    cust_specials: 'tnk_cust_specials',
    cust_comments: 'tnk_cust_comments',
    history: 'tnk_cust_history',
    balances: 'tnk_cust_balances'
  };

  // ---------- Auth ----------
  function getIdentityUser() {
    try {
      if (window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === 'function') {
        return window.netlifyIdentity.currentUser();
      }
    } catch {}
    return null;
  }
  function role() {
    const r = sessionStorage.getItem('tnk_role');
    if (r) return r;
    const u = getIdentityUser();
    if (!u) return null;
    // If not in admin/employee lists, treat as customer
    const email = (u.email || '').toLowerCase();
    const admins = (store.get('tnk_admin_emails', []) || []).map(x => x.toLowerCase());
    const employees = (store.get('tnk_employee_emails', []) || []).map(x => x.toLowerCase());
    if (admins.includes(email)) return 'admin';
    if (employees.includes(email)) return 'employee';
    return 'customer';
  }
  function assertCustomer() {
    const r = role();
    if (r === 'customer') return true;
    // If someone is logged as admin/employee, send to their portal instead.
    if (r === 'admin') { window.location.replace('admin.html'); return false; }
    if (r === 'employee') { window.location.replace('employee.html'); return false; }
    window.location.replace('index.html');
    return false;
  }
  if (!assertCustomer()) return;

  const logoutBtn = byId('cust-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { sessionStorage.removeItem('tnk_role'); sessionStorage.removeItem('tnk_user_email'); } catch {}
      try { if (window.netlifyIdentity && window.netlifyIdentity.currentUser()) await window.netlifyIdentity.logout(); } catch {}
      window.location.replace('index.html');
    });
  }

  function myEmail() {
    const ses = sessionStorage.getItem('tnk_user_email');
    if (ses) return ses;
    const u = getIdentityUser();
    return u?.email || '';
  }

  // ---------- Tabs ----------
  const tabs = $$('.tab-btn');
  const panels = {
    invoices: byId('panel-invoices'),
    payments: byId('panel-payments'),
    preferences: byId('panel-preferences'),
    extras: byId('panel-extras'),
    comments: byId('panel-comments'),
    history: byId('panel-history'),
    availability: byId('panel-availability'),
  };
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      Object.values(panels).forEach(p => p && p.classList.remove('active'));
      const key = btn.dataset.tab;
      byId(`panel-${key}`).classList.add('active');
    });
  });

  // ---------- Invoices ----------
  const invTbody = $('#cust_invoices tbody');
  const invStatus = byId('inv_status');

  function loadInvoices() { return store.get(KEYS.invoices, []); }
  function openInvoice(inv) {
    const itemsRows = (inv.items || []).map(it => `
      <tr>
        <td>${it.desc || ''}</td>
        <td>${it.qty || 0}</td>
        <td>${fmtMoney(it.unit || 0)}</td>
        <td>${fmtMoney((it.qty || 0) * (it.unit || 0))}</td>
      </tr>
    `).join('');
    const styles = `
      <style>
        body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; color:#1e2f1e; }
        h1,h2,h3 { margin:0 0 6px; }
        .head { display:flex; justify-content:space-between; gap:16px; margin-bottom:18px; }
        .meta { text-align:right; }
        table { width:100%; border-collapse:collapse; margin-top: 12px; }
        th, td { border-bottom:1px solid #e8e1d6; padding:8px; text-align:left; }
        tfoot td { border-top:2px solid #cfc7b6; font-weight:700; }
      </style>
    `;
    const html = `
      <!doctype html><html><head><meta charset="utf-8"><title>${inv.number}</title>${styles}</head>
      <body>
        <div class="head">
          <div><h2>TNK Lawncare Plus</h2><div>${inv.customer_email}</div></div>
          <div class="meta"><h1>${inv.number}</h1><div>${inv.date || ''}</div><div>Status: ${inv.status}</div></div>
        </div>
        <table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
        <tbody>${itemsRows || '<tr><td colspan="4">No items</td></tr>'}</tbody></table>
        <table style="max-width:360px;margin-left:auto;"><tbody>
          <tr><td>Subtotal</td><td style="text-align:right;">${fmtMoney(inv.subtotal || 0)}</td></tr>
          <tr><td>Tax (${(inv.tax_pct || 0).toFixed(2)}%)</td><td style="text-align:right;">${fmtMoney(inv.tax || 0)}</td></tr>
        </tbody><tfoot><tr><td>Total</td><td style="text-align:right;">${fmtMoney(inv.total || 0)}</td></tr></tfoot></table>
      </body></html>`;
    const win = window.open('', '_blank'); win.document.open(); win.document.write(html); win.document.close(); try { win.focus(); } catch {}
  }

  function renderInvoices() {
    const email = (myEmail() || '').toLowerCase();
    invTbody.innerHTML = '';
    if (!email) { invStatus.textContent = 'Not signed in.'; return; }
    const mine = loadInvoices().filter(i => (i.customer_email || '').toLowerCase() === email);
    if (mine.length === 0) { invTbody.innerHTML = '<tr><td colspan="6" class="muted">No invoices yet.</td></tr>'; return; }
    const rows = mine
      .sort((a,b)=> (a.date < b.date ? 1 : -1))
      .map(inv => `
        <tr data-id="${inv.id}">
          <td>${inv.number}</td>
          <td>${inv.date || ''}</td>
          <td>${inv.due || ''}</td>
          <td>${fmtMoney(inv.total)}</td>
          <td>${inv.status}</td>
          <td><button class="button js-view" type="button">View</button></td>
        </tr>
      `).join('');
    invTbody.innerHTML = rows;
  }
  invTbody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    const inv = loadInvoices().find(x => x.id === id);
    if (e.target.classList.contains('js-view') && inv) openInvoice(inv);
  });

  // ---------- Balance ----------
  function renderBalance() {
    const email = (myEmail() || '').toLowerCase();
    const balances = store.get(KEYS.balances, {});
    const bal = Number(balances[email] || 0);
    byId('cust_balance').textContent = fmtMoney(bal);
  }

  // ---------- Preferences ----------
  const prefForm = byId('pref-form');
  const prefStatus = byId('pref_status');
  function loadPrefs() {
    const all = store.get(KEYS.cust_prefs, {});
    const email = (myEmail() || '').toLowerCase();
    return all[email] || { svc: [], storm: [] };
  }
  function savePrefs(p) {
    const all = store.get(KEYS.cust_prefs, {});
    const email = (myEmail() || '').toLowerCase();
    all[email] = p;
    store.set(KEYS.cust_prefs, all);
  }
  function renderPrefs() {
    const p = loadPrefs();
    $$('input[name="svc"]').forEach(cb => cb.checked = p.svc.includes(cb.value));
    $$('input[name="storm"]').forEach(cb => cb.checked = p.storm.includes(cb.value));
  }
  prefForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const svc = $$('input[name="svc"]:checked').map(i => i.value);
    const storm = $$('input[name="storm"]:checked').map(i => i.value);
    savePrefs({ svc, storm });
    prefStatus.textContent = 'Preferences saved.';
  });

  // ---------- Extra Service ----------
  const extraForm = byId('extra-form');
  const extraStatus = byId('extra_status');
  function loadExtras() {
    const all = store.get(KEYS.cust_extras, {});
    const email = (myEmail() || '').toLowerCase();
    return all[email] || [];
  }
  function saveExtras(list) {
    const all = store.get(KEYS.cust_extras, {});
    const email = (myEmail() || '').toLowerCase();
    all[email] = list; store.set(KEYS.cust_extras, all);
  }
  extraForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const list = loadExtras();
    list.push({
      id: crypto.randomUUID(),
      service: byId('x_service').value.trim(),
      date: byId('x_date').value || '',
      notes: byId('x_notes').value.trim(),
      created_at: new Date().toISOString()
    });
    saveExtras(list);
    extraStatus.textContent = 'Request sent.';
    extraForm.reset();
  });

  // ---------- Special Requests ----------
  const spForm = byId('special-form');
  const spStatus = byId('sp_status');
  function loadSpecials() {
    const all = store.get(KEYS.cust_specials, {});
    const email = (myEmail() || '').toLowerCase();
    return all[email] || [];
  }
  function saveSpecials(list) {
    const all = store.get(KEYS.cust_specials, {});
    const email = (myEmail() || '').toLowerCase();
    all[email] = list; store.set(KEYS.cust_specials, all);
  }
  spForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const list = loadSpecials();
    list.push({
      id: crypto.randomUUID(),
      text: byId('sp_notes').value.trim(),
      date: todayISO()
    });
    saveSpecials(list);
    spStatus.textContent = 'Submitted.';
    spForm.reset();
  });

  // ---------- Comments ----------
  const cmForm = byId('comment-form');
  const cmStatus = byId('cmpl_status');
  const cmServiceSel = byId('cmpl_service');
  function loadHistory() {
    const all = store.get(KEYS.history, {});
    const email = (myEmail() || '').toLowerCase();
    return all[email] || [];
  }
  function saveComments(list) {
    const all = store.get(KEYS.cust_comments, {});
    const email = (myEmail() || '').toLowerCase();
    all[email] = list; store.set(KEYS.cust_comments, all);
  }
  function loadComments() {
    const all = store.get(KEYS.cust_comments, {});
    const email = (myEmail() || '').toLowerCase();
    return all[email] || [];
  }
  function renderComments() {
    const rows = loadComments()
      .sort((a,b)=> (a.date < b.date ? 1 : -1))
      .map(c => `<tr><td>${c.date}</td><td>${c.service || ''}</td><td>${c.text || ''}</td><td>${c.status || 'submitted'}</td></tr>`)
      .join('');
    $('#cust_comments tbody').innerHTML = rows || '<tr><td colspan="4" class="muted">No comments yet.</td></tr>';
  }
  function refreshHistorySelect() {
    const hist = loadHistory();
    cmServiceSel.innerHTML = hist.map(h => `<option value="${h.id}">${h.date} • ${h.type}</option>`).join('') || '<option value="">No history</option>';
  }
  cmForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const sel = cmServiceSel.value; if (!sel) { cmStatus.textContent = 'No service selected.'; return; }
    const hist = loadHistory();
    const svc = hist.find(h => h.id === sel);
    const list = loadComments();
    list.push({
      id: crypto.randomUUID(),
      service_id: sel,
      service: svc ? svc.type : '',
      text: byId('cmpl_text').value.trim(),
      date: todayISO(),
      status: 'submitted'
    });
    saveComments(list);
    cmStatus.textContent = 'Comment sent.';
    cmForm.reset();
    renderComments();
  });

  // ---------- History ----------
  function renderHistory() {
    const hist = loadHistory();
    const rows = hist.sort((a,b)=> (a.date < b.date ? 1 : -1))
      .map(h => `<tr><td>${h.date}</td><td>${h.type}</td><td>${h.notes || ''}</td><td>${h.tech || ''}</td></tr>`)
      .join('');
    $('#cust_history tbody').innerHTML = rows || '<tr><td colspan="4" class="muted">No services yet.</td></tr>';
  }

  // ---------- Availability ----------
  const slotsWrap = byId('cust_slots');
  function renderAvailability() {
    const slots = store.get(KEYS.availability, []);
    if (!slots || slots.length === 0) {
      slotsWrap.innerHTML = `<p class="muted">No open slots published yet. Check back soon or request a date in “Request Extra Service”.</p>`;
      return;
    }
    slotsWrap.innerHTML = slots
      .sort((a,b)=> (a.date < b.date ? -1 : 1) || (a.start || '').localeCompare(b.start || ''))
      .map(s => `<div class="slot"><div>${s.date} • ${s.start || ''}${s.end ? '–'+s.end : ''}</div><div><button class="button js-pick" data-pick='${JSON.stringify(s)}'>Pick</button></div></div>`)
      .join('');
  }
  slotsWrap?.addEventListener('click', (e) => {
    const pick = e.target?.dataset?.pick;
    if (!pick) return;
    try {
      const slot = JSON.parse(pick);
      const dateEl = byId('x_date');
      dateEl.value = slot.date || '';
      dateEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      tabs.forEach(b => b.setAttribute('aria-selected', 'false'));
      $$('[data-tab]').forEach(b => { if (b.dataset.tab === 'extras') b.setAttribute('aria-selected', 'true'); });
      Object.values(panels).forEach(p => p && p.classList.remove('active'));
      panels.extras.classList.add('active');
    } catch {}
  });

  // ---------- Init ----------
  renderInvoices();
  renderBalance();
  renderPrefs();
  refreshHistorySelect();
  renderComments();
  renderHistory();
  renderAvailability();

})();
