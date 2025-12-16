/* =========================================================
   TNK Admin Portal (front-end demo scaffolding)
   - Auth guard (admin)
   - Tabs
   - Local storage CRUD for: accounts, services, jobs, invoices,
     timesheets, promos/prices, reviews, PTO, paystubs, availability
   - Small, readable utilities
   ========================================================= */

(function () {
  // ---------- Utilities ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);
  const fmtMoney = (n) => `$${(Number(n || 0)).toFixed(2)}`;

  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch { return fallback; }
    },
    set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  };

  const KEYS = {
    accounts: 'tnk_accounts',
    services: 'tnk_services',
    jobs: 'tnk_jobs',
    invoices: 'tnk_invoices',
    timesheets: 'tnk_timesheets',
    promotions: 'tnk_promotions',
    prices: 'tnk_prices',
    reviews: 'tnk_reviews', // completed jobs awaiting admin
    pto: 'tnk_pto',
    paystubs: 'tnk_paystubs',
    availability: 'tnk_availability'
  };

  // ---------- Auth Guard (admin) ----------
  function getIdentityUser() {
    try {
      if (window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === 'function') {
        return window.netlifyIdentity.currentUser();
      }
    } catch {}
    return null;
  }

  function getRole() {
    // Primary: sessionStorage (set by your login pages)
    const role = sessionStorage.getItem('tnk_role');
    if (role) return role;

    // Fallback: Netlify Identity — map by email to role lists saved in localStorage
    const user = getIdentityUser();
    if (!user) return null;
    const email = (user.email || '').toLowerCase();

    const admins = (store.get('tnk_admin_emails', []) || []).map(x => x.toLowerCase());
    const employees = (store.get('tnk_employee_emails', []) || []).map(x => x.toLowerCase());
    if (admins.includes(email)) return 'admin';
    if (employees.includes(email)) return 'employee';
    return 'customer';
  }

  function assertAdminOrRedirect() {
    const role = getRole();
    if (role === 'admin') return true;
    // If identity present but not admin, kick to index
    window.location.replace('index.html');
    return false;
  }

  if (!assertAdminOrRedirect()) return;

  // Logout
  const logoutBtn = byId('admin-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { sessionStorage.removeItem('tnk_role'); sessionStorage.removeItem('tnk_user_email'); } catch {}
      try {
        if (window.netlifyIdentity && window.netlifyIdentity.currentUser()) {
          await window.netlifyIdentity.logout();
        }
      } catch {}
      window.location.replace('index.html');
    });
  }

  // ---------- Tabs ----------
  const tabs = $$('.tab-btn');
  const panels = {
    accounts: byId('panel-accounts'),
    schedule: byId('panel-schedule'),
    invoices: byId('panel-invoices'),
    timesheets: byId('panel-timesheets'),
    services: byId('panel-services'),
    reviews: byId('panel-reviews'),
    promos: byId('panel-promos'),
  };
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      Object.values(panels).forEach(p => p && p.classList.remove('active'));
      const key = btn.dataset.tab;
      const panel = byId(`panel-${key}`);
      if (panel) panel.classList.add('active');
    });
  });

  // ---------- Seed minimal data ----------
  (function seed() {
    if (!store.get(KEYS.accounts)) {
      store.set(KEYS.accounts, [
        { id: crypto.randomUUID(), role: 'employee', name: 'Malachi Goreman', email: 'malachi@example.com', phone: '', address: '' },
        { id: crypto.randomUUID(), role: 'employee', name: 'Ian Loney', email: 'ian@example.com', phone: '', address: '' },
        { id: crypto.randomUUID(), role: 'customer', name: 'Megan R', email: 'megan@example.com', phone: '', address: 'Lincoln City, OR' },
      ]);
    }
    if (!store.get(KEYS.timesheets)) store.set(KEYS.timesheets, []);
    if (!store.get(KEYS.prices)) store.set(KEYS.prices, { essential: 35, standard: 55, premium: 85 });
    if (!store.get(KEYS.promotions)) store.set(KEYS.promotions, { title: 'Storm-Season Check', subtitle: 'Inspection + Light Debris Removal', active: true });
    if (!store.get(KEYS.invoices)) store.set(KEYS.invoices, []);
    if (!store.get(KEYS.services)) store.set(KEYS.services, []);
    if (!store.get(KEYS.jobs)) store.set(KEYS.jobs, []);
    if (!store.get(KEYS.reviews)) store.set(KEYS.reviews, []);
    if (!store.get(KEYS.pto)) store.set(KEYS.pto, []);
    if (!store.get(KEYS.paystubs)) store.set(KEYS.paystubs, []);
    if (!store.get(KEYS.availability)) store.set(KEYS.availability, []);
  })();

  // ========================================================
  // ACCOUNTS
  // ========================================================
  const accForm = byId('acc-form');
  const accTableBody = $('#acc_table tbody');
  const accFilterRole = byId('acc_filter_role');
  const accSearch = byId('acc_search');
  const accStatus = byId('acc_status');

  const accFields = {
    id: byId('acc_id'),
    role: byId('acc_role'),
    email: byId('acc_email'),
    name: byId('acc_name'),
    phone: byId('acc_phone'),
    address: byId('acc_address'),
  };

  const accResetBtn = byId('acc_reset');

  function loadAccounts() { return store.get(KEYS.accounts, []); }
  function saveAccounts(list) {
    store.set(KEYS.accounts, list);
    renderAccounts();
    refreshSelects();
  }

  function renderAccounts() {
    const role = accFilterRole?.value || 'all';
    const q = (accSearch?.value || '').toLowerCase();
    const rows = loadAccounts()
      .filter(a => role === 'all' ? true : a.role === role)
      .filter(a => !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
      .map(a => `
        <tr data-id="${a.id}">
          <td>${a.role}</td>
          <td>${a.name}</td>
          <td>${a.email}</td>
          <td>${a.phone || ''}</td>
          <td>${a.role === 'customer' ? (a.address || '') : ''}</td>
          <td>
            <button class="btn-small js-acc-edit">Edit</button>
            <button class="btn-small btn-small--danger js-acc-del">Delete</button>
          </td>
        </tr>
      `).join('');
    accTableBody.innerHTML = rows || '<tr><td colspan="6" class="muted">No accounts found.</td></tr>';
  }

  function resetAccountForm() {
    accFields.id.value = '';
    accFields.role.value = 'customer';
    accFields.email.value = '';
    accFields.name.value = '';
    accFields.phone.value = '';
    accFields.address.value = '';
    accStatus.textContent = '';
  }

  accForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = accFields.id.value || crypto.randomUUID();
    const data = {
      id,
      role: accFields.role.value,
      email: accFields.email.value.trim(),
      name: accFields.name.value.trim(),
      phone: accFields.phone.value.trim(),
      address: accFields.address.value.trim(),
    };
    const list = loadAccounts();
    const idx = list.findIndex(a => a.id === id);
    if (idx >= 0) list[idx] = data; else list.push(data);
    saveAccounts(list);
    accStatus.textContent = 'Saved.';
    resetAccountForm();
  });

  accResetBtn?.addEventListener('click', resetAccountForm);
  accFilterRole?.addEventListener('change', renderAccounts);
  accSearch?.addEventListener('input', renderAccounts);

  accTableBody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    const list = loadAccounts();
    const item = list.find(a => a.id === id);
    if (e.target.classList.contains('js-acc-edit')) {
      accFields.id.value = item.id;
      accFields.role.value = item.role;
      accFields.email.value = item.email;
      accFields.name.value = item.name;
      accFields.phone.value = item.phone || '';
      accFields.address.value = item.address || '';
      window.scrollTo({ top: byId('panel-accounts').offsetTop - 12, behavior: 'smooth' });
    }
    if (e.target.classList.contains('js-acc-del')) {
      if (confirm('Delete this account?')) saveAccounts(list.filter(a => a.id !== id));
    }
  });

  // ========================================================
  // SELECT REFRESHERS (customers/employees in datalists/selects)
  // ========================================================
  function refreshSelects() {
    const customers = loadAccounts().filter(x => x.role === 'customer');
    const employees = loadAccounts().filter(x => x.role === 'employee');

    // Job form datalists
    const dlCust = byId('admin-customers'); if (dlCust) dlCust.innerHTML = customers.map(c => `<option value="${c.email}">${c.name}</option>`).join('');
    const dlEmp = byId('admin-employees'); if (dlEmp) dlEmp.innerHTML = employees.map(e => `<option value="${e.email}">${e.name}</option>`).join('');

    // Invoice customer datalist/select
    const dlCustEmail = byId('admin-customer-emails'); if (dlCustEmail) dlCustEmail.innerHTML = customers.map(c => `<option value="${c.email}">${c.name}</option>`).join('');
    const fCust = byId('f_inv_customer'); if (fCust) {
      const keep = fCust.value;
      fCust.innerHTML = `<option value="all">All Customers</option>` + customers.map(c => `<option value="${c.email}">${c.name} (${c.email})</option>`).join('');
      if ([...fCust.options].some(o => o.value === keep)) fCust.value = keep;
    }

    // Timesheets employee select
    const tsSel = byId('ts_filter_email'); if (tsSel) {
      const keep = tsSel.value;
      tsSel.innerHTML = `<option value="all">All Employees</option>` + employees.map(e => `<option value="${e.email}">${e.name} (${e.email})</option>`).join('');
      if ([...tsSel.options].some(o => o.value === keep)) tsSel.value = keep;
    }

    // Employee datalist in timesheet form
    const tsDL = byId('employee-emails'); if (tsDL) tsDL.innerHTML = employees.map(e => `<option value="${e.email}">`).join('');
  }

  // ========================================================
  // SCHEDULE & JOBS
  // ========================================================
  const jobForm = byId('job-form');
  const jobStatus = byId('job_status_msg');
  const jobReset = byId('job_reset');

  function loadJobs() { return store.get(KEYS.jobs, []); }
  function saveJobs(list) { store.set(KEYS.jobs, list); renderAdminCalendar(); }

  function renderAdminCalendar() {
    const cal = byId('admin-calendar');
    if (!cal) return;
    const jobs = loadJobs().sort((a, b) => (a.date < b.date ? -1 : 1) || (a.start || '').localeCompare(b.start || ''));
    if (jobs.length === 0) { cal.innerHTML = `<p class="muted">No jobs scheduled.</p>`; return; }
    cal.innerHTML = jobs.map(j => {
      const cust = (j.customer || '').split('@')[0];
      const when = [j.date, j.start].filter(Boolean).join(' ');
      return `
        <div class="slot" data-id="${j.id}">
          <div><strong>${cust || j.customer}</strong> — ${j.title || ''}</div>
          <div>${when}</div>
        </div>
      `;
    }).join('');
    cal.onclick = (e) => {
      const el = e.target.closest('.slot'); if (!el) return;
      const id = el.dataset.id;
      const job = loadJobs().find(x => x.id === id);
      if (!job) return;
      // Load into form for quick edit
      fillJobForm(job);
      window.scrollTo({ top: jobForm.offsetTop - 12, behavior: 'smooth' });
    };
  }

  function fillJobForm(j) {
    byId('job_id').value = j.id;
    byId('job_customer').value = j.customer || '';
    byId('job_title').value = j.title || '';
    byId('job_date').value = j.date || '';
    byId('job_start').value = j.start || '';
    byId('job_end').value = j.end || '';
    byId('job_assignee').value = j.assignee || '';
    byId('job_invoice').value = j.invoice || '';
    byId('job_lat').value = j.lat || '';
    byId('job_lon').value = j.lon || '';
    byId('job_risk_rain').value = j.risk_rain ?? 50;
    byId('job_risk_gust').value = j.risk_gust ?? 35;
    byId('job_status').value = j.status || 'scheduled';
    byId('job_notes').value = j.notes || '';
  }

  jobForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = byId('job_id').value || crypto.randomUUID();
    const data = {
      id,
      customer: byId('job_customer').value.trim(),
      title: byId('job_title').value.trim(),
      date: byId('job_date').value,
      start: byId('job_start').value,
      end: byId('job_end').value,
      assignee: byId('job_assignee').value.trim(),
      invoice: byId('job_invoice').value.trim(),
      lat: byId('job_lat').value || '',
      lon: byId('job_lon').value || '',
      risk_rain: Number(byId('job_risk_rain').value || 50),
      risk_gust: Number(byId('job_risk_gust').value || 35),
      status: byId('job_status').value,
      notes: byId('job_notes').value.trim(),
    };
    const list = loadJobs();
    const idx = list.findIndex(x => x.id === id);
    if (idx >= 0) list[idx] = data; else list.push(data);
    saveJobs(list);
    jobStatus.textContent = 'Saved.';
    jobForm.reset();
    byId('job_id').value = '';
  });

  jobReset?.addEventListener('click', () => {
    jobForm.reset();
    byId('job_id').value = '';
    jobStatus.textContent = '';
  });

  // ========================================================
  // INVOICES
  // ========================================================
  const invForm = byId('inv-form');
  const invItemsWrap = byId('items-rows');
  const invAddItemBtn = byId('add-item');
  const invTableBody = $('#inv_table tbody');
  const fInvCustomer = byId('f_inv_customer');
  const fInvStatus = byId('f_inv_status');
  const fInvQ = byId('f_inv_q');
  const invStatusMsg = byId('inv_status_msg');
  const invResetBtn = byId('inv_reset');
  const btnExportCSV = byId('inv_export_csv');
  const invTotalOut = byId('inv_total');

  function loadInvoices() { return store.get(KEYS.invoices, []); }
  function saveInvoices(list) { store.set(KEYS.invoices, list); renderInvoices(); }

  function autoInvoiceNumber() {
    const key = 'tnk_inv_counter';
    let n = Number(localStorage.getItem(key) || 1000);
    n += 1;
    localStorage.setItem(key, String(n));
    return `INV-${n}`;
  }

  function addItemRow(item = { desc: '', qty: 1, unit: 35 }) {
    const row = document.createElement('div');
    row.className = 'items-row';
    row.innerHTML = `
      <input type="text" class="it-desc" placeholder="Description" value="${item.desc || ''}" />
      <input type="number" class="it-qty" min="0" step="1" value="${item.qty || 1}" />
      <input type="number" class="it-unit" min="0" step="0.01" value="${item.unit || 0}" />
      <button type="button" class="btn-small js-del-item">Delete</button>
    `;
    invItemsWrap.appendChild(row);
    row.addEventListener('input', recalcInvoiceTotals);
    row.querySelector('.js-del-item').addEventListener('click', () => { row.remove(); recalcInvoiceTotals(); });
    recalcInvoiceTotals();
  }

  function invoiceItems() {
    return $$('.items-row', invItemsWrap).map(r => ({
      desc: $('.it-desc', r).value.trim(),
      qty: Number($('.it-qty', r).value || 0),
      unit: Number($('.it-unit', r).value || 0),
    })).filter(i => i.desc || i.qty || i.unit);
  }

  function recalcInvoiceTotals() {
    const items = invoiceItems();
    const subtotal = items.reduce((s, i) => s + i.qty * i.unit, 0);
    const taxPct = Number(byId('inv_tax').value || 0);
    const total = subtotal + subtotal * (taxPct / 100);
    invTotalOut.textContent = fmtMoney(total);
  }

  invAddItemBtn?.addEventListener('click', () => addItemRow());

  function resetInvoiceForm() {
    byId('inv_id').value = '';
    byId('inv_customer').value = '';
    byId('inv_number').value = autoInvoiceNumber();
    byId('inv_status').value = 'unpaid';
    byId('inv_date').valueAsDate = new Date();
    byId('inv_due').value = '';
    byId('inv_tax').value = '0';
    byId('inv_notes').value = '';
    invItemsWrap.innerHTML = '';
    addItemRow({ desc: 'Mowing / Trimming', qty: 1, unit: 35 });
    invStatusMsg.textContent = '';
    recalcInvoiceTotals();
  }

  invForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = byId('inv_id').value || crypto.randomUUID();
    const items = invoiceItems();
    const subtotal = items.reduce((s, i) => s + i.qty * i.unit, 0);
    const taxPct = Number(byId('inv_tax').value || 0);
    const total = subtotal + subtotal * (taxPct / 100);

    const data = {
      id,
      customer_email: byId('inv_customer').value.trim(),
      number: byId('inv_number').value.trim() || autoInvoiceNumber(),
      status: byId('inv_status').value,
      date: byId('inv_date').value,
      due: byId('inv_due').value,
      tax_pct: taxPct,
      items,
      subtotal,
      tax: subtotal * (taxPct / 100),
      total,
      notes: byId('inv_notes').value.trim(),
    };

    const list = loadInvoices();
    const idx = list.findIndex(x => x.id === id);
    if (idx >= 0) list[idx] = data; else list.push(data);
    saveInvoices(list);
    invStatusMsg.textContent = 'Invoice saved.';
    resetInvoiceForm();
  });

  invResetBtn?.addEventListener('click', resetInvoiceForm);
  byId('inv_tax')?.addEventListener('input', recalcInvoiceTotals);

  function renderInvoices() {
    const list = loadInvoices();
    const fCust = fInvCustomer?.value || 'all';
    const fStat = fInvStatus?.value || 'all';
    const q = (fInvQ?.value || '').toLowerCase();

    const rows = list
      .filter(i => fCust === 'all' ? true : i.customer_email === fCust)
      .filter(i => fStat === 'all' ? true : i.status === fStat)
      .filter(i => !q || i.number.toLowerCase().includes(q) || i.customer_email.toLowerCase().includes(q))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map(i => `
        <tr data-id="${i.id}">
          <td>${i.number}</td>
          <td>${i.customer_email}</td>
          <td>${i.date || ''}</td>
          <td>${i.due || ''}</td>
          <td>${fmtMoney(i.total)}</td>
          <td>${i.status}</td>
          <td>
            <button class="btn-small js-inv-view">View</button>
            <button class="btn-small js-inv-edit">Edit</button>
            <button class="btn-small ${i.status === 'paid' ? '' : 'btn-small--ok'} js-inv-toggle">
              ${i.status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
            </button>
            <button class="btn-small btn-small--danger js-inv-del">Delete</button>
          </td>
        </tr>
      `).join('');
    invTableBody.innerHTML = rows || '<tr><td colspan="7" class="muted">No invoices yet.</td></tr>';
  }

  invTableBody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    const list = loadInvoices();
    const item = list.find(x => x.id === id);

    if (e.target.classList.contains('js-inv-edit')) {
      byId('inv_id').value = item.id;
      byId('inv_customer').value = item.customer_email;
      byId('inv_number').value = item.number;
      byId('inv_status').value = item.status;
      byId('inv_date').value = item.date || '';
      byId('inv_due').value = item.due || '';
      byId('inv_tax').value = item.tax_pct || 0;
      byId('inv_notes').value = item.notes || '';
      invItemsWrap.innerHTML = '';
      (item.items || []).forEach(addItemRow);
      if (!item.items || item.items.length === 0) addItemRow();
      recalcInvoiceTotals();
      window.scrollTo({ top: invForm.offsetTop - 12, behavior: 'smooth' });
    }

    if (e.target.classList.contains('js-inv-toggle')) {
      item.status = item.status === 'paid' ? 'unpaid' : 'paid';
      saveInvoices(list);
    }

    if (e.target.classList.contains('js-inv-del')) {
      if (confirm('Delete this invoice?')) {
        saveInvoices(list.filter(x => x.id !== id));
      }
    }

    if (e.target.classList.contains('js-inv-view')) {
      openInvoiceWindow(item);
    }
  });

  btnExportCSV?.addEventListener('click', () => {
    const list = loadInvoices();
    const rows = [
      ['number','customer_email','date','due','status','subtotal','tax','total','notes'],
      ...list.map(i => [
        i.number, i.customer_email, i.date||'', i.due||'', i.status,
        i.subtotal, i.tax, i.total, (i.notes||'').replaceAll('"','""')
      ])
    ];
    const csv = rows.map(r => r.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'invoices.csv'; a.click();
    URL.revokeObjectURL(url);
  });

  function openInvoiceWindow(inv) {
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
        .head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; }
        .brand { display:flex; align-items:center; gap:12px; }
        .brand img { width:64px; height:64px; border-radius:12px; }
        .meta { text-align:right; }
        .muted { opacity:.8; }
        table { width:100%; border-collapse:collapse; margin-top: 12px; }
        th, td { border-bottom:1px solid #e8e1d6; padding:8px; text-align:left; }
        tfoot td { border-top:2px solid #cfc7b6; font-weight:700; }
        .totals { max-width:360px; margin-left:auto; }
        .actions { margin-top: 18px; }
        button { padding:.5rem .9rem; border-radius:8px; border:1px solid #cfcfcf; background:#fff; cursor:pointer; }
      </style>
    `;
    const html = `
      <!doctype html><html><head><meta charset="utf-8"><title>${inv.number}</title>${styles}</head>
      <body>
        <div class="head">
          <div class="brand">
            <img src="images/IMG_2713.png" alt="">
            <div>
              <h2>The Neighborhood Kids Lawncare Plus</h2>
              <div class="muted">Serving Pacific City to Depoe Bay • 541-921-4416 • TNKLCP@gmail.com</div>
            </div>
          </div>
          <div class="meta">
            <h1>${inv.number}</h1>
            <div>Date: ${inv.date || ''}</div>
            <div>Due: ${inv.due || ''}</div>
            <div>Status: ${inv.status}</div>
          </div>
        </div>

        <div><strong>Bill To:</strong> ${inv.customer_email}</div>

        <table>
          <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
          <tbody>${itemsRows || '<tr><td colspan="4" class="muted">No items</td></tr>'}</tbody>
        </table>

        <table class="totals">
          <tbody>
            <tr><td>Subtotal</td><td style="text-align:right;">${fmtMoney(inv.subtotal || 0)}</td></tr>
            <tr><td>Tax (${(inv.tax_pct || 0).toFixed(2)}%)</td><td style="text-align:right;">${fmtMoney(inv.tax || 0)}</td></tr>
          </tbody>
          <tfoot>
            <tr><td>Total</td><td style="text-align:right;">${fmtMoney(inv.total || 0)}</td></tr>
          </tfoot>
        </table>

        ${inv.notes ? `<p class="muted">Notes: ${inv.notes}</p>` : ''}

        <div class="actions"><button onclick="window.print()">Print / Save PDF</button></div>
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    win.document.open(); win.document.write(html); win.document.close(); try { win.focus(); } catch {}
  }

  // ========================================================
  // TIMESHEETS & PAYROLL
  // ========================================================
  const tsForm = byId('ts-form');
  const tsStatus = byId('ts_status');
  const tsResetBtn = byId('ts_reset');
  const tsTableBody = $('#ts_table tbody');
  const tsFilterEmail = byId('ts_filter_email');
  const tsFilterFrom = byId('ts_filter_from');
  const tsFilterTo = byId('ts_filter_to');
  const tsClearFilters = byId('ts_clear_filters');

  function loadTimesheets() { return store.get(KEYS.timesheets, []); }
  function saveTimesheets(list) { store.set(KEYS.timesheets, list); renderTimesheets(); }

  function parseTimeToHours(hhmm) {
    if (!hhmm) return 0;
    const [h, m] = hhmm.split(':').map(Number);
    return h + (m || 0) / 60;
    }
  function calcHours(start, end) {
    const s = parseTimeToHours(start);
    const e = parseTimeToHours(end);
    return Math.max(0, e - s);
  }

  function renderTimesheets() {
    const list = loadTimesheets();
    const filterEmail = tsFilterEmail?.value || 'all';
    const from = tsFilterFrom?.value ? new Date(tsFilterFrom.value) : null;
    const to = tsFilterTo?.value ? new Date(tsFilterTo.value) : null;

    const rows = list
      .filter(t => filterEmail === 'all' ? true : t.employee_email === filterEmail)
      .filter(t => {
        const d = new Date(t.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map(t => {
        const total = calcHours(t.start_time, t.end_time).toFixed(2);
        return `
          <tr data-id="${t.id}">
            <td>${t.date}</td>
            <td>${t.employee_email}</td>
            <td>${t.start_time}</td>
            <td>${t.end_time}</td>
            <td>${total}</td>
            <td>${t.notes || ''}</td>
            <td>
              <button class="btn-small js-ts-approve ${t.approved ? 'btn-small--ok' : ''}">${t.approved ? 'Approved' : 'Approve'}</button>
            </td>
            <td>
              <button class="btn-small js-ts-edit">Edit</button>
              <button class="btn-small btn-small--danger js-ts-del">Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    tsTableBody.innerHTML = rows || '<tr><td colspan="8" class="muted">No timesheets yet.</td></tr>';
  }

  tsForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = byId('ts_id').value || crypto.randomUUID();
    const data = {
      id,
      employee_email: byId('ts_employee_email').value.trim(),
      date: byId('ts_date').value,
      start_time: byId('ts_start').value,
      end_time: byId('ts_end').value,
      notes: byId('ts_notes').value.trim(),
      approved: false
    };
    const list = loadTimesheets();
    const idx = list.findIndex(t => t.id === id);
    if (idx >= 0) { data.approved = !!list[idx].approved; list[idx] = data; }
    else list.push(data);
    saveTimesheets(list);
    tsStatus.textContent = 'Saved.';
    tsForm.reset();
    byId('ts_id').value = '';
  });

  tsResetBtn?.addEventListener('click', () => {
    tsForm.reset();
    byId('ts_id').value = '';
    tsStatus.textContent = '';
  });

  tsTableBody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    const list = loadTimesheets();
    const item = list.find(t => t.id === id);

    if (e.target.classList.contains('js-ts-edit')) {
      byId('ts_id').value = item.id;
      byId('ts_employee_email').value = item.employee_email;
      byId('ts_date').value = item.date;
      byId('ts_start').value = item.start_time;
      byId('ts_end').value = item.end_time;
      byId('ts_notes').value = item.notes || '';
      window.scrollTo({ top: tsForm.offsetTop - 12, behavior: 'smooth' });
    }
    if (e.target.classList.contains('js-ts-del')) {
      if (confirm('Delete this entry?')) saveTimesheets(list.filter(t => t.id !== id));
    }
    if (e.target.classList.contains('js-ts-approve')) {
      item.approved = !item.approved;
      saveTimesheets(list);
    }
  });

  tsFilterEmail?.addEventListener('change', renderTimesheets);
  tsFilterFrom?.addEventListener('change', renderTimesheets);
  tsFilterTo?.addEventListener('change', renderTimesheets);
  tsClearFilters?.addEventListener('click', () => {
    tsFilterEmail.value = 'all'; tsFilterFrom.value = ''; tsFilterTo.value = ''; renderTimesheets();
  });

  // ========================================================
  // SERVICES CATALOG
  // ========================================================
  const svcForm = byId('svc-form');
  const svcTableBody = $('#svc_table tbody');
  const svcStatus = byId('svc_status');
  const svcReset = byId('svc_reset');

  function loadServices() { return store.get(KEYS.services, []); }
  function saveServices(list) { store.set(KEYS.services, list); renderServices(); }

  svcForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = byId('svc_id').value || crypto.randomUUID();
    const data = {
      id,
      name: byId('svc_name').value.trim(),
      tier: byId('svc_tier').value,
      price_from: Number(byId('svc_price').value || 0),
      desc: byId('svc_desc').value.trim(),
    };
    const list = loadServices();
    const idx = list.findIndex(s => s.id === id);
    if (idx >= 0) list[idx] = data; else list.push(data);
    saveServices(list);
    svcStatus.textContent = 'Saved.';
    svcForm.reset(); byId('svc_id').value = '';
  });

  svcReset?.addEventListener('click', () => { svcForm.reset(); byId('svc_id').value = ''; svcStatus.textContent = ''; });

  function renderServices() {
    const rows = loadServices().map(s => `
      <tr data-id="${s.id}">
        <td>${s.tier}</td>
        <td>${s.name}</td>
        <td>${fmtMoney(s.price_from)}</td>
        <td>${s.desc || ''}</td>
        <td>
          <button class="btn-small js-svc-edit">Edit</button>
          <button class="btn-small btn-small--danger js-svc-del">Delete</button>
        </td>
      </tr>
    `).join('');
    svcTableBody.innerHTML = rows || '<tr><td colspan="5" class="muted">No services yet.</td></tr>';
  }

  svcTableBody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    const list = loadServices();
    const item = list.find(s => s.id === id);
    if (e.target.classList.contains('js-svc-edit')) {
      byId('svc_id').value = item.id;
      byId('svc_name').value = item.name || '';
      byId('svc_tier').value = item.tier || 'essential';
      byId('svc_price').value = item.price_from || 0;
      byId('svc_desc').value = item.desc || '';
      window.scrollTo({ top: svcForm.offsetTop - 12, behavior: 'smooth' });
    }
    if (e.target.classList.contains('js-svc-del')) {
      if (confirm('Delete this item?')) saveServices(list.filter(s => s.id !== id));
    }
  });

  // ========================================================
  // REVIEWS (Completed Jobs → admin approves)
  // ========================================================
  const reviewTableBody = $('#review_table tbody');
  function loadReviews() { return store.get(KEYS.reviews, []); }
  function saveReviews(list) { store.set(KEYS.reviews, list); renderReviews(); }

  function renderReviews() {
    const rows = loadReviews().sort((a,b)=> (a.date < b.date ? 1 : -1)).map(r => `
      <tr data-id="${r.id}">
        <td>${r.date || ''}</td>
        <td>${r.customer || ''}</td>
        <td>${r.title || ''}</td>
        <td>${(r.photos || []).length} photo(s)</td>
        <td>${r.notes || ''}</td>
        <td>
          <button class="btn-small btn-small--ok js-rv-approve">Approve</button>
          <button class="btn-small btn-small--danger js-rv-reject">Reject</button>
        </td>
      </tr>
    `).join('');
    reviewTableBody.innerHTML = rows || '<tr><td colspan="6" class="muted">No completed jobs pending.</td></tr>';
  }

  reviewTableBody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    const list = loadReviews();
    const item = list.find(x => x.id === id);
    if (e.target.classList.contains('js-rv-approve')) {
      // If invoice attached in job, send email later (backend)
      saveReviews(list.filter(x => x.id !== id));
    }
    if (e.target.classList.contains('js-rv-reject')) {
      saveReviews(list.filter(x => x.id !== id));
    }
  });

  // ========================================================
  // PTO (time off)
  // ========================================================
  const ptoTableBody = $('#pto_table tbody');
  function loadPTO() { return store.get(KEYS.pto, []); }
  function savePTO(list) { store.set(KEYS.pto, list); renderPTO(); }

  function renderPTO() {
    const rows = loadPTO().sort((a,b)=> (a.from < b.from ? 1 : -1)).map(p => `
      <tr data-id="${p.id}">
        <td>${p.employee || ''}</td>
        <td>${p.from || ''}</td>
        <td>${p.to || ''}</td>
        <td>${p.reason || ''}</td>
        <td>${p.status || 'pending'}</td>
        <td>
          <button class="btn-small btn-small--ok js-pto-approve">Approve</button>
          <button class="btn-small btn-small--danger js-pto-reject">Reject</button>
        </td>
      </tr>
    `).join('');
    ptoTableBody.innerHTML = rows || '<tr><td colspan="6" class="muted">No requests.</td></tr>';
  }

  ptoTableBody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    const list = loadPTO();
    const item = list.find(x => x.id === id);
    if (!item) return;
    if (e.target.classList.contains('js-pto-approve')) { item.status = 'approved'; savePTO(list); }
    if (e.target.classList.contains('js-pto-reject')) { item.status = 'rejected'; savePTO(list); }
  });

  // ========================================================
  // PROMOS & PRICES
  // ========================================================
  const promoForm = byId('promo-form');
  const promoStatus = byId('promo_status');
  const priceForm = byId('price-form');
  const priceStatus = byId('price_status');

  promoForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      title: byId('promo_title').value.trim(),
      subtitle: byId('promo_subtitle').value.trim(),
      active: byId('promo_active').value === 'true'
    };
    store.set(KEYS.promotions, data);
    promoStatus.textContent = 'Promotion saved.';
  });

  priceForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      essential: Number(byId('p_essential').value || 35),
      standard: Number(byId('p_standard').value || 55),
      premium: Number(byId('p_premium').value || 85),
    };
    store.set(KEYS.prices, data);
    priceStatus.textContent = 'Prices saved.';
  });

  // ---------- Initial renders ----------
  refreshSelects();
  renderAccounts();
  renderAdminCalendar();
  resetInvoiceForm();
  renderInvoices();
  renderTimesheets();
  renderServices();
  renderReviews();
  renderPTO();

})();
