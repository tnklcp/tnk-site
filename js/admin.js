// ===== Redirect helper to prevent ping-pong =====
function redirectOnce(url) {
  const now = Date.now();
  const last = Number(sessionStorage.getItem('tnk_redirect_lock') || 0);
  if (now - last < 1500) return;
  sessionStorage.setItem('tnk_redirect_lock', String(now));
  window.location.replace(url);
}

// ===== Auth gate =====
(function authGate() {
  const role = sessionStorage.getItem('tnk_role');
  const root = document.getElementById('admin-root');
  const err = document.getElementById('auth-error');
  if (role === 'admin') {
    document.body.classList.remove('locked');
    if (root) root.removeAttribute('aria-hidden');
    if (err) err.hidden = true;
  } else {
    document.body.classList.remove('locked');
    if (root) { root.setAttribute('aria-hidden','true'); root.style.display='none'; }
    if (err) err.hidden = false;
    redirectOnce(role === 'employee' ? 'employee.html' : 'login.html');
  }
})();

// ===== Tabs =====
const tabs = document.querySelectorAll('.tab-btn');
const panels = {
  accounts: document.getElementById('panel-accounts'),
  timesheets: document.getElementById('panel-timesheets'),
  promos: document.getElementById('panel-promos'),
  prices: document.getElementById('panel-prices'),
  invoices: document.getElementById('panel-invoices'),
};
tabs.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    tabs.forEach(b=>b.setAttribute('aria-selected','false'));
    btn.setAttribute('aria-selected','true');
    Object.values(panels).forEach(p=>p.classList.remove('active'));
    panels[btn.dataset.tab].classList.add('active');
  });
});

// ===== Local Storage Helpers =====
const store = {
  get(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }catch{ return fallback; } },
  set(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
};
const KEYS = {
  accounts: 'tnk_accounts',
  timesheets: 'tnk_timesheets',
  promos: 'tnk_promotions',
  prices: 'tnk_prices',
  invoices: 'tnk_invoices'
};

// Seed minimal data if empty
(function seed(){
  if(!store.get(KEYS.accounts)) {
    store.set(KEYS.accounts, [
      { id: crypto.randomUUID(), role:'employee', name:'Malachi Goreman', email:'malachi@example.com', phone:'', address:'' },
      { id: crypto.randomUUID(), role:'employee', name:'Ian Loney', email:'ian@example.com', phone:'', address:'' },
      { id: crypto.randomUUID(), role:'customer', name:'Megan R', email:'megan@example.com', phone:'', address:'Lincoln City, OR' },
    ]);
  }
  if(!store.get(KEYS.timesheets)) { store.set(KEYS.timesheets, []); }
  if(!store.get(KEYS.prices)) { store.set(KEYS.prices, { essential:35, standard:55, premium:85 }); }
  if(!store.get(KEYS.promos)) { store.set(KEYS.promos, { title:'Storm-Season Check', subtitle:'Inspection + Light Debris Removal', active:true }); }
  if(!store.get(KEYS.invoices)) { store.set(KEYS.invoices, []); }
})();

// ===== Accounts Module =====
const accForm = document.getElementById('account-form');
const accIdEl = document.getElementById('acc_id');
const accRoleEl = document.getElementById('acc_role');
const accEmailEl = document.getElementById('acc_email');
const accNameEl = document.getElementById('acc_name');
const accPhoneEl = document.getElementById('acc_phone');
const accAddrEl = document.getElementById('acc_address');
const accSubmitText = document.getElementById('acc_submit_text');
const accResetBtn = document.getElementById('acc_reset');
const accStatus = document.getElementById('acc_status');
const accTableBody = document.querySelector('#acc_table tbody');
const accFilterRole = document.getElementById('acc_filter_role');
const accSearch = document.getElementById('acc_search');

function loadAccounts(){ return store.get(KEYS.accounts, []); }
function saveAccounts(list){ store.set(KEYS.accounts, list); renderAccounts(); refreshEmployeeSelects(); refreshCustomerSelects(); }

function renderAccounts(){
  const role = accFilterRole.value;
  const q = (accSearch.value || '').toLowerCase();
  const rows = loadAccounts()
    .filter(a => role==='all' ? true : a.role === role)
    .filter(a => !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
    .map(a => {
      return `<tr data-id="${a.id}">
        <td>${a.role}</td>
        <td>${a.name}</td>
        <td>${a.email}</td>
        <td>${a.phone || ''}</td>
        <td>${a.role==='customer' ? (a.address||'') : ''}</td>
        <td class="cell-actions">
          <button class="btn-small btn-edit" type="button">Edit</button>
          <button class="btn-small btn-small--danger btn-del" type="button">Delete</button>
        </td>
      </tr>`;
    }).join('');
  accTableBody.innerHTML = rows || '<tr><td colspan="6" class="muted">No accounts found.</td></tr>';
}

function resetAccountForm(){
  accIdEl.value = '';
  accRoleEl.value = 'customer';
  accEmailEl.value = '';
  accNameEl.value = '';
  accPhoneEl.value = '';
  accAddrEl.value = '';
  accSubmitText.textContent = 'Save Account';
  accStatus.textContent = '';
}

accForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const id = accIdEl.value || crypto.randomUUID();
  const data = {
    id,
    role: accRoleEl.value,
    email: accEmailEl.value.trim(),
    name: accNameEl.value.trim(),
    phone: accPhoneEl.value.trim(),
    address: accAddrEl.value.trim()
  };
  const list = loadAccounts();
  const existingIdx = list.findIndex(a=>a.id===id);
  if(existingIdx >= 0) list[existingIdx] = data; else list.push(data);
  saveAccounts(list);
  accStatus.textContent = 'Saved.';
  resetAccountForm();
});

accResetBtn.addEventListener('click', resetAccountForm);
accFilterRole.addEventListener('change', renderAccounts);
accSearch.addEventListener('input', renderAccounts);

accTableBody.addEventListener('click', (e)=>{
  const tr = e.target.closest('tr');
  if(!tr) return;
  const id = tr.dataset.id;
  const list = loadAccounts();
  const item = list.find(a=>a.id===id);
  if(e.target.classList.contains('btn-edit')){
    accIdEl.value = item.id;
    accRoleEl.value = item.role;
    accEmailEl.value = item.email;
    accNameEl.value = item.name;
    accPhoneEl.value = item.phone || '';
    accAddrEl.value = item.address || '';
    accSubmitText.textContent = 'Update Account';
    window.scrollTo({ top: document.querySelector('#panel-accounts').offsetTop - 20, behavior: 'smooth' });
  }
  if(e.target.classList.contains('btn-del')){
    if(confirm('Delete this account?')){
      saveAccounts(list.filter(a=>a.id!==id));
    }
  }
});

// ===== Timesheets Module =====
const tsForm = document.getElementById('ts-form');
const tsIdEl = document.getElementById('ts_id');
const tsEmpEmailEl = document.getElementById('ts_employee_email');
const tsDateEl = document.getElementById('ts_date');
const tsStartEl = document.getElementById('ts_start');
const tsEndEl = document.getElementById('ts_end');
const tsNotesEl = document.getElementById('ts_notes');
const tsSubmitText = document.getElementById('ts_submit_text');
const tsStatus = document.getElementById('ts_status');
const tsResetBtn = document.getElementById('ts_reset');

const tsTableBody = document.querySelector('#ts_table tbody');
const tsFilterEmail = document.getElementById('ts_filter_email');
const tsFilterFrom = document.getElementById('ts_filter_from');
const tsFilterTo = document.getElementById('ts_filter_to');
const tsClearFilters = document.getElementById('ts_clear_filters');
const employeeDatalist = document.getElementById('employee-emails');

function loadTimesheets(){ return store.get(KEYS.timesheets, []); }
function saveTimesheets(list){ store.set(KEYS.timesheets, list); renderTimesheets(); }

function refreshEmployeeSelects(){
  const emps = loadAccounts().filter(a=>a.role==='employee');
  employeeDatalist.innerHTML = emps.map(e=>`<option value="${e.email}">`).join('');
  const current = tsFilterEmail.value;
  tsFilterEmail.innerHTML = `<option value="all">All Employees</option>` + emps.map(e=>`<option value="${e.email}">${e.name} (${e.email})</option>`).join('');
  if([...tsFilterEmail.options].some(o=>o.value===current)) tsFilterEmail.value=current;
}

function parseTimeToHours(hhmm){
  if(!hhmm) return 0;
  const [h,m] = hhmm.split(':').map(Number);
  return h + (m||0)/60;
}
function calcHours(start, end){
  const s = parseTimeToHours(start);
  const e = parseTimeToHours(end);
  const diff = Math.max(0, e - s);
  return Math.round(diff * 100) / 100;
}

function renderTimesheets(){
  const list = loadTimesheets();
  const filterEmail = tsFilterEmail.value;
  const from = tsFilterFrom.value ? new Date(tsFilterFrom.value) : null;
  const to = tsFilterTo.value ? new Date(tsFilterTo.value) : null;

  const rows = list
    .filter(t => filterEmail==='all' ? true : t.employee_email === filterEmail)
    .filter(t => {
      const d = new Date(t.date || t.work_date || t.date);
      if(from && d < from) return false;
      if(to && d > to) return false;
      return true;
    })
    .sort((a,b)=> (a.date<b.date?1:-1))
    .map(t => {
      const total = (t.hours != null) ? Number(t.hours).toFixed(2)
                   : calcHours(t.start_time, t.end_time).toFixed(2);
      return `<tr data-id="${t.id}">
        <td>${t.date || t.work_date || ''}</td>
        <td>${t.employee_email}</td>
        <td>${t.start_time || ''}</td>
        <td>${t.end_time || ''}</td>
        <td>${total}</td>
        <td>${t.notes||''}</td>
        <td>
          <button class="btn-small btn-approve ${t.approved?'btn-small--ok':''}" type="button">${t.approved?'Approved':'Approve'}</button>
        </td>
        <td class="cell-actions">
          <button class="btn-small btn-edit" type="button">Edit</button>
          <button class="btn-small btn-small--danger btn-del" type="button">Delete</button>
        </td>
      </tr>`;
    }).join('');
  tsTableBody.innerHTML = rows || '<tr><td colspan="8" class="muted">No timesheets yet.</td></tr>';
}

tsForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const id = tsIdEl.value || crypto.randomUUID();
  const data = {
    id,
    employee_email: tsEmpEmailEl.value.trim(),
    date: tsDateEl.value,
    start_time: tsStartEl.value,
    end_time: tsEndEl.value,
    notes: tsNotesEl.value.trim(),
    approved: false
  };
  const list = loadTimesheets();
  const idx = list.findIndex(t=>t.id===id);
  if(idx>=0) {
    data.approved = !!list[idx].approved;
    list[idx] = data;
    tsSubmitText.textContent = 'Save Entry';
  } else {
    list.push(data);
  }
  saveTimesheets(list);
  tsStatus.textContent = 'Saved.';
  tsForm.reset();
  tsIdEl.value = '';
});

tsResetBtn.addEventListener('click', ()=>{
  tsForm.reset();
  tsIdEl.value = '';
  tsSubmitText.textContent = 'Save Entry';
  tsStatus.textContent = '';
});

tsTableBody.addEventListener('click', (e)=>{
  const tr = e.target.closest('tr');
  if(!tr) return;
  const id = tr.dataset.id;
  const list = loadTimesheets();
  const item = list.find(t=>t.id===id);

  if(e.target.classList.contains('btn-edit')){
    tsIdEl.value = item.id;
    tsEmpEmailEl.value = item.employee_email;
    tsDateEl.value = item.date || item.work_date || '';
    tsStartEl.value = item.start_time || '';
    tsEndEl.value = item.end_time || '';
    tsNotesEl.value = item.notes || '';
    tsSubmitText.textContent = 'Update Entry';
    window.scrollTo({ top: document.querySelector('#panel-timesheets').offsetTop - 20, behavior: 'smooth' });
  }
  if(e.target.classList.contains('btn-del')){
    if(confirm('Delete this timesheet?')){
      saveTimesheets(list.filter(t=>t.id!==id));
    }
  }
  if(e.target.classList.contains('btn-approve')){
    item.approved = !item.approved;
    saveTimesheets(list);
  }
});

tsFilterEmail.addEventListener('change', renderTimesheets);
tsFilterFrom.addEventListener('change', renderTimesheets);
tsFilterTo.addEventListener('change', renderTimesheets);
tsClearFilters.addEventListener('click', ()=>{
  tsFilterEmail.value = 'all'; tsFilterFrom.value=''; tsFilterTo.value='';
  renderTimesheets();
});

// ===== Promotions + Prices =====
const promoForm = document.getElementById('promo-form');
const promoStatus = document.getElementById('promo_status');
promoForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const data = {
    title: document.getElementById('promo_title').value.trim(),
    subtitle: document.getElementById('promo_subtitle').value.trim(),
    active: document.getElementById('promo_active').value === 'true'
  };
  store.set(KEYS.promos, data);
  promoStatus.textContent = 'Promotion saved.';
});
(function loadPromos(){
  const p = store.get(KEYS.promos, null);
  if(!p) return;
  document.getElementById('promo_title').value = p.title || '';
  document.getElementById('promo_subtitle').value = p.subtitle || '';
  document.getElementById('promo_active').value = p.active ? 'true' : 'false';
})();

const priceForm = document.getElementById('price-form');
const priceStatus = document.getElementById('price_status');
priceForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const data = {
    essential: Number(document.getElementById('p_essential').value || 35),
    standard: Number(document.getElementById('p_standard').value || 55),
    premium: Number(document.getElementById('p_premium').value || 85),
  };
  store.set(KEYS.prices, data);
  priceStatus.textContent = 'Prices saved.';
});
(function loadPrices(){
  const p = store.get(KEYS.prices, null);
  if(!p) return;
  document.getElementById('p_essential').value = p.essential ?? 35;
  document.getElementById('p_standard').value = p.standard ?? 55;
  document.getElementById('p_premium').value = p.premium ?? 85;
})();

// ===== Invoices Module =====
const invForm = document.getElementById('inv-form');
const invIdEl = document.getElementById('inv_id');
const invCustomerEl = document.getElementById('inv_customer');
const invNumberEl = document.getElementById('inv_number');
const invStatusEl = document.getElementById('inv_status');
const invDateEl = document.getElementById('inv_date');
const invDueEl = document.getElementById('inv_due');
const invTaxEl = document.getElementById('inv_tax');
const invNotesEl = document.getElementById('inv_notes');
const invItemsWrap = document.getElementById('items-rows');
const invAddItemBtn = document.getElementById('add-item');
const invSubmitText = document.getElementById('inv_submit_text');
const invStatusMsg = document.getElementById('inv_status_msg');
const invResetBtn = document.getElementById('inv_reset');

const outSub = document.getElementById('inv_subtotal');
const outTax = document.getElementById('inv_tax_amt');
const outTotal = document.getElementById('inv_total');

const invTableBody = document.querySelector('#inv_table tbody');
const fInvCustomer = document.getElementById('f_inv_customer');
const fInvStatus = document.getElementById('f_inv_status');
const fInvQ = document.getElementById('f_inv_q');
const btnExportCSV = document.getElementById('inv_export_csv');
const customerDatalist = document.getElementById('customer-emails');

function loadInvoices(){ return store.get(KEYS.invoices, []); }
function saveInvoices(list){ store.set(KEYS.invoices, list); renderInvoices(); }

function refreshCustomerSelects(){
  const customers = loadAccounts().filter(a=>a.role==='customer');
  customerDatalist.innerHTML = customers.map(c=>`<option value="${c.email}">`).join('');
  const current = fInvCustomer.value;
  fInvCustomer.innerHTML = `<option value="all">All Customers</option>` + customers.map(c=>`<option value="${c.email}">${c.name} (${c.email})</option>`).join('');
  if([...fInvCustomer.options].some(o=>o.value===current)) fInvCustomer.value=current;
}

function money(n){ return `$${(Number(n||0)).toFixed(2)}`; }

function addItemRow(item={ desc:'', qty:1, unit:35 }){
  const row = document.createElement('div');
  row.className = 'items-row';
  row.innerHTML = `
    <input type="text" class="it-desc" placeholder="Description" value="${item.desc||''}" />
    <input type="number" class="it-qty" min="0" step="1" value="${item.qty||1}" />
    <input type="number" class="it-unit" min="0" step="0.01" value="${item.unit||0}" />
    <button type="button" class="btn-small btn-del-item">Delete</button>
  `;
  invItemsWrap.appendChild(row);
  row.addEventListener('input', recalcTotals);
  row.querySelector('.btn-del-item').addEventListener('click', ()=>{ row.remove(); recalcTotals(); });
  recalcTotals();
}

function getItems(){
  return [...invItemsWrap.querySelectorAll('.items-row')].map(r=>({
    desc: r.querySelector('.it-desc').value.trim(),
    qty: Number(r.querySelector('.it-qty').value || 0),
    unit: Number(r.querySelector('.it-unit').value || 0),
  })).filter(i=>i.desc || i.qty || i.unit);
}

function recalcTotals(){
  const items = getItems();
  const subtotal = items.reduce((s,i)=> s + i.qty * i.unit, 0);
  const taxPct = Number(invTaxEl.value || 0);
  const taxAmt = subtotal * (taxPct/100);
  const total = subtotal + taxAmt;
  outSub.textContent = money(subtotal);
  outTax.textContent = money(taxAmt);
  outTotal.textContent = money(total);
}

invAddItemBtn.addEventListener('click', ()=> addItemRow());

function resetInvoiceForm(){
  invIdEl.value = '';
  invCustomerEl.value = '';
  invNumberEl.value = autoInvoiceNumber();
  invStatusEl.value = 'unpaid';
  invDateEl.valueAsDate = new Date();
  invDueEl.value = '';
  invTaxEl.value = '0';
  invNotesEl.value = '';
  invItemsWrap.innerHTML = '';
  addItemRow({ desc:'Mowing / Trimming', qty:1, unit:35 });
  invSubmitText.textContent = 'Save Invoice';
  invStatusMsg.textContent = '';
  recalcTotals();
}

function autoInvoiceNumber(){
  const key='tnk_inv_counter';
  let n = Number(localStorage.getItem(key) || 1000);
  n += 1;
  localStorage.setItem(key, String(n));
  return `INV-${n}`;
}

// Save invoice
invForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const id = invIdEl.value || crypto.randomUUID();
  const items = getItems();
  const taxPct = Number(invTaxEl.value || 0);
  const subtotal = items.reduce((s,i)=> s + i.qty * i.unit, 0);
  const taxAmt = subtotal * (taxPct/100);
  const total = subtotal + taxAmt;

  const data = {
    id,
    customer_email: invCustomerEl.value.trim(),
    number: invNumberEl.value.trim() || autoInvoiceNumber(),
    status: invStatusEl.value,
    date: invDateEl.value,
    due: invDueEl.value,
    tax_pct: taxPct,
    items,
    subtotal,
    tax: taxAmt,
    total,
    notes: invNotesEl.value.trim()
  };

  const list = loadInvoices();
  const idx = list.findIndex(x=>x.id===id);
  if(idx>=0) { list[idx] = data; }
  else { list.push(data); }
  saveInvoices(list);

  invStatusMsg.textContent = 'Invoice saved.';
  resetInvoiceForm();
});

invResetBtn.addEventListener('click', resetInvoiceForm);
[invTaxEl].forEach(el=> el.addEventListener('input', recalcTotals));

function renderInvoices(){
  const list = loadInvoices();
  const fCust = fInvCustomer.value;
  const fStat = fInvStatus.value;
  const q = (fInvQ.value || '').toLowerCase();

  const rows = list
    .filter(i => fCust==='all' ? true : i.customer_email === fCust)
    .filter(i => fStat==='all' ? true : i.status === fStat)
    .filter(i => !q || i.number.toLowerCase().includes(q) || i.customer_email.toLowerCase().includes(q))
    .sort((a,b)=> (a.date < b.date ? 1 : -1))
    .map(i => `
      <tr data-id="${i.id}">
        <td>${i.number}</td>
        <td>${i.customer_email}</td>
        <td>${i.date||''}</td>
        <td>${i.due||''}</td>
        <td>${money(i.total)}</td>
        <td>${i.status}</td>
        <td class="cell-actions">
          <button class="btn-small btn-view" type="button">View</button>
          <button class="btn-small btn-edit" type="button">Edit</button>
          <button class="btn-small ${i.status==='paid'?'':'btn-small--ok'} btn-toggle" type="button">
            ${i.status==='paid'?'Mark Unpaid':'Mark Paid'}
          </button>
          <button class="btn-small btn-small--danger btn-del" type="button">Delete</button>
        </td>
      </tr>
    `).join('');
  invTableBody.innerHTML = rows || '<tr><td colspan="7" class="muted">No invoices yet.</td></tr>';
}

invTableBody.addEventListener('click', (e)=>{
  const tr = e.target.closest('tr');
  if(!tr) return;
  const id = tr.dataset.id;
  const list = loadInvoices();
  const item = list.find(x=>x.id===id);

  if(e.target.classList.contains('btn-edit')){
    invIdEl.value = item.id;
    invCustomerEl.value = item.customer_email;
    invNumberEl.value = item.number;
    invStatusEl.value = item.status;
    invDateEl.value = item.date || '';
    invDueEl.value = item.due || '';
    invTaxEl.value = item.tax_pct || 0;
    invNotesEl.value = item.notes || '';
    invItemsWrap.innerHTML = '';
    (item.items || []).forEach(addItemRow);
    if(!item.items || item.items.length===0) addItemRow();
    invSubmitText.textContent = 'Update Invoice';
    invStatusMsg.textContent = '';
    recalcTotals();
    window.scrollTo({ top: document.querySelector('#panel-invoices').offsetTop - 20, behavior:'smooth' });
  }

  if(e.target.classList.contains('btn-toggle')){
    item.status = item.status === 'paid' ? 'unpaid' : 'paid';
    saveInvoices(list);
  }

  if(e.target.classList.contains('btn-del')){
    if(confirm('Delete this invoice?')){
      saveInvoices(list.filter(x=>x.id!==id));
    }
  }

  if(e.target.classList.contains('btn-view')){
    openInvoiceWindow(item);
  }
});

[fInvCustomer, fInvStatus].forEach(el=> el.addEventListener('change', renderInvoices));
fInvQ.addEventListener('input', renderInvoices);

btnExportCSV.addEventListener('click', ()=>{
  const list = loadInvoices();
  const rows = [
    ['number','customer_email','date','due','status','subtotal','tax','total','notes'],
    ...list.map(i=>[
      i.number, i.customer_email, i.date||'', i.due||'', i.status,
      i.subtotal, i.tax, i.total, (i.notes||'').replaceAll('"','"')
    ])
  ];
  const csv = rows.map(r=> r.map(v=>{
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'invoices.csv'; a.click();
  URL.revokeObjectURL(url);
});

function openInvoiceWindow(inv){
  const win = window.open('', '_blank');
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
  const money = n => `$${(Number(n||0)).toFixed(2)}`;
  const itemsRows = (inv.items||[]).map(it=>`
    <tr>
      <td>${it.desc||''}</td>
      <td>${it.qty||0}</td>
      <td>${money(it.unit||0)}</td>
      <td>${money((it.qty||0)*(it.unit||0))}</td>
    </tr>
  `).join('');

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
          <div>Date: ${inv.date||''}</div>
          <div>Due: ${inv.due||''}</div>
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
          <tr><td>Subtotal</td><td style="text-align:right;">${money(inv.subtotal||0)}</td></tr>
          <tr><td>Tax (${(inv.tax_pct||0).toFixed(2)}%)</td><td style="text-align:right;">${money(inv.tax||0)}</td></tr>
        </tbody>
        <tfoot>
          <tr><td>Total</td><td style="text-align:right;">${money(inv.total||0)}</td></tr>
        </tfoot>
      </table>

      ${inv.notes ? `<p class="muted">Notes: ${inv.notes}</p>` : ''}

      <div class="actions">
        <button onclick="window.print()">Print / Save PDF</button>
      </div>
    </body>
    </html>
  `;
  win.document.open(); win.document.write(html); win.document.close();
  try { win.focus(); } catch {}
}

// ===== Initial renders =====
renderAccounts();
refreshEmployeeSelects();
refreshCustomerSelects();
renderTimesheets();
resetInvoiceForm();
renderInvoices();
