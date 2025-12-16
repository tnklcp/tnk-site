/* TNK Customer Portal — Netlify Identity auth + your existing UI */
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const byId=(id)=>document.getElementById(id);
  const money=(n)=>`$${(Number(n||0)).toFixed(2)}`;
  const todayISO=()=>new Date().toISOString().slice(0,10);

  // ===== Auth: customer only (admins → admin.html, employees → employee.html) =====
  function routeByRole(){
    const role = window.TNKIdentity?.role?.();
    if (role==='customer') return true;
    if (role==='admin') { location.replace('admin.html'); return false; }
    if (role==='employee') { location.replace('employee.html'); return false; }
    // fallback to session
    const r = sessionStorage.getItem('tnk_role');
    if (r==='customer') return true;
    if (r==='admin') { location.replace('admin.html'); return false; }
    if (r==='employee') { location.replace('employee.html'); return false; }
    location.replace('index.html'); return false;
  }
  if(!routeByRole()) return;

  // logout
  byId('cust-logout')?.addEventListener('click', (e)=>{ e.preventDefault(); window.TNKIdentity?.logout?.(); });

  function myEmail(){
    const s=sessionStorage.getItem('tnk_user_email'); if(s) return s;
    return window.TNKIdentity?.email?.() || '';
  }

  // ===== Data (same local model) =====
  const store={ get(k,f){try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}}, set(k,v){localStorage.setItem(k,JSON.stringify(v));} };
  const KEYS={ invoices:'tnk_invoices', availability:'tnk_availability', cust_prefs:'tnk_cust_prefs', cust_extras:'tnk_cust_extras', cust_specials:'tnk_cust_specials', cust_comments:'tnk_cust_comments', history:'tnk_cust_history', balances:'tnk_cust_balances' };

  // tabs
  const tabs=$$('.tab-btn'); tabs.forEach(b=>b.addEventListener('click',()=>{tabs.forEach(t=>t.setAttribute('aria-selected','false')); b.setAttribute('aria-selected','true'); $$('.tab-panel').forEach(p=>p.classList.remove('active')); byId(`panel-${b.dataset.tab}`).classList.add('active');}));

  // invoices
  function loadInvoices(){ return store.get(KEYS.invoices, []); }
  const invTbody=$('#cust_invoices tbody'); const invStatus=byId('inv_status');
  function renderInvoices(){
    const email=(myEmail()||'').toLowerCase();
    if(!email){ invStatus.textContent='Not signed in.'; return; }
    const mine=loadInvoices().filter(i=>(i.customer_email||'').toLowerCase()===email);
    invTbody.innerHTML = mine.sort((a,b)=>a.date<b.date?1:-1).map(i=>`<tr data-id="${i.id}"><td>${i.number}</td><td>${i.date||''}</td><td>${i.due||''}</td><td>${money(i.total)}</td><td>${i.status}</td><td><button class="button js-view">View</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No invoices yet.</td></tr>';
  }
  invTbody?.addEventListener('click',(e)=>{ const tr=e.target.closest('tr'); if(!tr) return; const id=tr.dataset.id; const inv=loadInvoices().find(x=>x.id===id); if(!inv) return;
    const rows=(inv.items||[]).map(it=>`<tr><td>${it.desc||''}</td><td>${it.qty||0}</td><td>${money(it.unit||0)}</td><td>${money((it.qty||0)*(it.unit||0))}</td></tr>`).join('');
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>${inv.number}</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;color:#1e2f1e}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e8e1d6;padding:8px;text-align:left}</style></head><body><h1>${inv.number}</h1><div>${inv.date||''} • ${inv.status}</div><table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No items</td></tr>'}</tbody></table><p><strong>Total: ${money(inv.total||0)}</strong></p></body></html>`;
    const win=window.open('','_blank'); win.document.open(); win.document.write(html); win.document.close(); try{win.focus();}catch{};
  });

  // balance
  function renderBalance(){
    const email=(myEmail()||'').toLowerCase(); const balances=store.get(KEYS.balances, {}); const bal=Number(balances[email]||0);
    byId('cust_balance').textContent = money(bal);
  }

  // preferences
  const prefForm=byId('pref-form'); const prefStatus=byId('pref_status');
  function loadPrefs(){ const all=store.get(KEYS.cust_prefs, {}); const email=(myEmail()||'').toLowerCase(); return all[email]||{svc:[],storm:[]}; }
  function savePrefs(p){ const all=store.get(KEYS.cust_prefs, {}); const email=(myEmail()||'').toLowerCase(); all[email]=p; store.set(KEYS.cust_prefs, all); }
  function renderPrefs(){ const p=loadPrefs(); $$('input[name="svc"]').forEach(cb=> cb.checked = p.svc.includes(cb.value)); $$('input[name="storm"]').forEach(cb=> cb.checked = p.storm.includes(cb.value)); }
  prefForm?.addEventListener('submit',(e)=>{ e.preventDefault(); const svc=$$('input[name="svc"]:checked').map(i=>i.value); const storm=$$('input[name="storm"]:checked').map(i=>i.value); savePrefs({svc,storm}); prefStatus.textContent='Preferences saved.'; });

  // extra service
  const extraForm=byId('extra-form'); const extraStatus=byId('extra_status');
  function loadExtras(){ const all=store.get(KEYS.cust_extras, {}); const email=(myEmail()||'').toLowerCase(); return all[email]||[]; }
  function saveExtras(list){ const all=store.get(KEYS.cust_extras, {}); const email=(myEmail()||'').toLowerCase(); all[email]=list; store.set(KEYS.cust_extras, all); }
  extraForm?.addEventListener('submit',(e)=>{ e.preventDefault(); const list=loadExtras(); list.push({ id:crypto.randomUUID(), service:byId('x_service').value.trim(), date:byId('x_date').value||'', notes:byId('x_notes').value.trim(), created_at: new Date().toISOString() }); saveExtras(list); extraStatus.textContent='Request sent.'; extraForm.reset(); });

  // special requests
  const spForm=byId('special-form'); const spStatus=byId('sp_status');
  function loadSpecials(){ const all=store.get(KEYS.cust_specials, {}); const email=(myEmail()||'').toLowerCase(); return all[email]||[]; }
  function saveSpecials(list){ const all=store.get(KEYS.cust_specials, {}); const email=(myEmail()||'').toLowerCase(); all[email]=list; store.set(KEYS.cust_specials, all); }
  spForm?.addEventListener('submit',(e)=>{ e.preventDefault(); const list=loadSpecials(); list.push({ id:crypto.randomUUID(), text:byId('sp_notes').value.trim(), date: todayISO() }); saveSpecials(list); spStatus.textContent='Submitted.'; spForm.reset(); });

  // comments on services (history-driven)
  const cmForm=byId('comment-form'); const cmStatus=byId('cmpl_status'); const cmSel=byId('cmpl_service');
  function loadHistory(){ const all=store.get(KEYS.history, {}); const email=(myEmail()||'').toLowerCase(); return all[email]||[]; }
  function refreshHistorySelect(){ const hist=loadHistory(); cmSel.innerHTML = hist.map(h=>`<option value="${h.id}">${h.date} • ${h.type}</option>`).join('') || '<option value="">No history</option>'; }
  function loadComments(){ const all=store.get(KEYS.cust_comments, {}); const email=(myEmail()||'').toLowerCase(); return all[email]||[]; }
  function saveComments(list){ const all=store.get(KEYS.cust_comments, {}); const email=(myEmail()||'').toLowerCase(); all[email]=list; store.set(KEYS.cust_comments, all); }
  function renderComments(){ const rows=loadComments().sort((a,b)=>a.date<b.date?1:-1).map(c=>`<tr><td>${c.date}</td><td>${c.service||''}</td><td>${c.text||''}</td><td>${c.status||'submitted'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No comments yet.</td></tr>'; $('#cust_comments tbody').innerHTML = rows; }
  cmForm?.addEventListener('submit',(e)=>{ e.preventDefault(); const id=cmSel.value; if(!id){ cmStatus.textContent='No service selected.'; return; } const hist=loadHistory(); const svc=hist.find(h=>h.id===id); const list=loadComments(); list.push({ id:crypto.randomUUID(), service_id:id, service: svc?svc.type:'', text: byId('cmpl_text').value.trim(), date: todayISO(), status:'submitted' }); saveComments(list); cmStatus.textContent='Comment sent.'; cmForm.reset(); renderComments(); });

  // history table
  function renderHistory(){
    const hist=loadHistory();
    $('#cust_history tbody').innerHTML = hist.sort((a,b)=>a.date<b.date?1:-1).map(h=>`<tr><td>${h.date}</td><td>${h.type}</td><td>${h.notes||''}</td><td>${h.tech||''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No services yet.</td></tr>';
  }

  // availability
  const slotsWrap=byId('cust_slots');
  function renderAvailability(){
    const slots=store.get(KEYS.availability, []);
    if(!slots.length){ slotsWrap.innerHTML = '<p class="muted">No open slots published yet.</p>'; return; }
    slotsWrap.innerHTML = slots.sort((a,b)=> (a.date<b.date?-1:1) || (a.start||'').localeCompare(b.start||'')).map(s=>`<div class="slot"><div>${s.date} • ${s.start||''}${s.end?('–'+s.end):''}</div><div><button class="button js-pick" data-pick='${JSON.stringify(s)}'>Pick</button></div></div>`).join('');
  }
  slotsWrap?.addEventListener('click',(e)=>{ const pick=e.target?.dataset?.pick; if(!pick) return; try{ const slot=JSON.parse(pick); const el=byId('x_date'); el.value=slot.date||''; $$('.tab-btn').forEach(t=>t.setAttribute('aria-selected','false')); $$('[data-tab="extras"]')[0]?.setAttribute('aria-selected','true'); $$('.tab-panel').forEach(p=>p.classList.remove('active')); byId('panel-extras').classList.add('active'); el.scrollIntoView({behavior:'smooth', block:'center'});}catch{} });
<script>
/* Minimal tabs: works for both .tab-panel and .panel with data-tab="X" → #panel-X */
(function initTabs(){
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  if (!tabs.length) return;

  const panels = Array.from(document.querySelectorAll('.tab-panel, .panel'));

  function activate(btn){
    const id = `panel-${btn.dataset.tab}`;
    tabs.forEach(b => b.setAttribute('aria-selected','false'));
    btn.setAttribute('aria-selected','true');
    panels.forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
  }

  tabs.forEach(btn => btn.addEventListener('click', () => activate(btn)));

  // ensure only one panel is active on load
  const current = tabs.find(b => b.getAttribute('aria-selected') === 'true') || tabs[0];
  if (current) activate(current);
})();
</script>

  // init
  renderInvoices(); renderBalance(); renderPrefs(); refreshHistorySelect(); renderComments(); renderHistory(); renderAvailability();
})();

