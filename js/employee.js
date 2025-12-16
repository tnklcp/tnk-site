/* TNK Employee Portal — Netlify Identity auth + your existing UI */
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const byId=(id)=>document.getElementById(id);
  const money=(n)=>`$${(Number(n||0)).toFixed(2)}`;
  const todayISO=()=>new Date().toISOString().slice(0,10);

  // ===== Auth: employee or admin =====
  function ok(){
    const role = window.TNKIdentity?.role?.();
    if (role==='employee' || role==='admin') return true;
    const sessionRole = sessionStorage.getItem('tnk_role');
    if (sessionRole==='employee' || sessionRole==='admin') return true;
    location.replace('index.html'); return false;
  }
  if(!ok()) return;

  // logout
  byId('emp-logout')?.addEventListener('click', (e)=>{ e.preventDefault(); window.TNKIdentity?.logout?.(); });

  // identity email
  function myEmail(){
    const s=sessionStorage.getItem('tnk_user_email'); if(s) return s;
    return window.TNKIdentity?.email?.() || '';
  }

  // ===== data (same local model) =====
  const store={ get(k,f){try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}}, set(k,v){localStorage.setItem(k,JSON.stringify(v));} };
  const KEYS={ jobs:'tnk_jobs', reviews:'tnk_reviews', timesheets:'tnk_timesheets', pto:'tnk_pto', paystubs:'tnk_paystubs', emp_comments:'tnk_emp_comments' };

  // tabs (same)
  const tabs=$$('.tab-btn'); const panels={today:byId('panel-today'),week:byId('panel-week'),complete:byId('panel-complete'),hours:byId('panel-hours'),paystubs:byId('panel-paystubs'),pto:byId('panel-pto'),comments:byId('panel-comments')};
  tabs.forEach(b=>b.addEventListener('click',()=>{tabs.forEach(t=>t.setAttribute('aria-selected','false')); b.setAttribute('aria-selected','true'); $$('.tab-panel').forEach(p=>p.classList.remove('active')); byId(`panel-${b.dataset.tab}`).classList.add('active');}));

  // jobs today
  function loadJobs(){ return store.get(KEYS.jobs, []); }
  const todayBody = $('#emp_today_jobs tbody'); const jobDrawer = byId('emp_job_drawer');
  function renderToday(){
    const me=(myEmail()||'').toLowerCase(); const today=todayISO();
    const rows=loadJobs().filter(j=>j.date===today && (!j.assignee || j.assignee.toLowerCase()===me))
      .sort((a,b)=>(a.start||'').localeCompare(b.start||''))
      .map(j=>`<tr data-id="${j.id}"><td>${j.start||''}</td><td>${j.customer||''}</td><td>${j.title||''}</td><td>${j.notes||''}</td></tr>`).join('');
    todayBody.innerHTML = rows || '<tr><td colspan="4" class="muted">No jobs today.</td></tr>';
  }
  todayBody?.addEventListener('click',(e)=>{ const tr=e.target.closest('tr'); if(!tr) return; const j=loadJobs().find(x=>x.id===tr.dataset.id); if(!j) return; jobDrawer.innerHTML = `<p><strong>${j.title||''}</strong></p><p><strong>Customer:</strong> ${j.customer||''}</p><p><strong>When:</strong> ${j.date||''} ${j.start||''}${j.end?('–'+j.end):''}</p><p><strong>Notes:</strong> ${j.notes||''}</p><p><strong>Status:</strong> ${j.status||'scheduled'}</p>`; });

  // week
  function renderWeek(){
    const me=(myEmail()||'').toLowerCase();
    const rows=loadJobs().filter(j=>!j.assignee || j.assignee.toLowerCase()===me)
      .sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.start||'').localeCompare(b.start||''))
      .map(j=>`<div class="slot"><div>${j.date} ${j.start||''}</div><div><strong>${(j.customer||'').split('@')[0]}</strong> — ${j.title||''}</div></div>`).join('');
    byId('emp_week_calendar').innerHTML = rows || '<p class="muted">No jobs.</p>';
  }

  // complete job
  function loadReviews(){ return store.get(KEYS.reviews, []); } function saveReviews(v){ store.set(KEYS.reviews,v); renderCompletions(); }
  const cForm=byId('emp-complete-form'); const cSel=byId('c_job'); const cStatus=byId('c_status');
  function refreshCompleteSelect(){
    const me=(myEmail()||'').toLowerCase();
    cSel.innerHTML = `<option value="">Select…</option>` + loadJobs().filter(j=>(!j.assignee||j.assignee.toLowerCase()===me)&&(j.status==='scheduled'||j.status==='in_progress')).sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(j=>`<option value="${j.id}">${j.date} • ${j.title} (${j.customer})</option>`).join('');
  }
  cForm?.addEventListener('submit',(e)=>{
    e.preventDefault();
    const id=cSel.value; if(!id){ cStatus.textContent='Pick a job.'; return; }
    const jobs=loadJobs(); const j=jobs.find(x=>x.id===id); if(!j){ cStatus.textContent='Job not found.'; return; }
    const photos=Array.from(byId('c_photos').files||[]).map(f=>f.name);
    const list=loadReviews(); list.push({ id:crypto.randomUUID(), job_id:j.id, date:j.date, customer:j.customer, title:j.title, notes:byId('c_notes').value.trim(), photos, employee: myEmail(), status:'pending' });
    store.set(KEYS.reviews,list); j.status='complete_pending_review'; store.set(KEYS.jobs,jobs);
    cStatus.textContent='Submitted for admin review.'; cForm.reset(); refreshCompleteSelect(); renderCompletions();
  });
  function renderCompletions(){
    const me=(myEmail()||'').toLowerCase();
    $('#emp_completions tbody').innerHTML = loadReviews().filter(r=>(r.employee||'').toLowerCase()===me).sort((a,b)=>a.date<b.date?1:-1).map(r=>`<tr><td>${r.date||''}</td><td>${r.title||''}</td><td>${r.status||'pending'}</td><td>${r.notes||''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No submissions.</td></tr>';
  }

  // hours
  function loadTimesheets(){ return store.get(KEYS.timesheets, []); } function saveTimesheets(v){ store.set(KEYS.timesheets,v); renderHours(); }
  const hForm=byId('emp-hours-form'); const hStatus=byId('eh_status');
  hForm?.addEventListener('submit',(e)=>{
    e.preventDefault();
    const list=loadTimesheets(); list.push({ id:crypto.randomUUID(), employee_email: myEmail(), date: byId('eh_date').value, hours: Number(byId('eh_hours').value||0), start_time:'', end_time:'', notes: byId('eh_notes').value.trim(), approved:false });
    saveTimesheets(list); hStatus.textContent='Saved.'; hForm.reset();
  });
  function renderHours(){
    const me=(myEmail()||'').toLowerCase();
    $('#emp_hours_table tbody').innerHTML = loadTimesheets().filter(t=>(t.employee_email||'').toLowerCase()===me).sort((a,b)=>a.date<b.date?1:-1).map(t=>`<tr><td>${t.date}</td><td>${t.hours||0}</td><td>${t.approved?'approved':'pending'}</td><td>${t.notes||''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No hours yet.</td></tr>';
  }

  // paystubs
  function loadPaystubs(){ return store.get(KEYS.paystubs, []); }
  function renderPaystubs(){
    const me=(myEmail()||'').toLowerCase();
    $('#emp_paystubs tbody').innerHTML = loadPaystubs().filter(p=>(p.employee||'').toLowerCase()===me).sort((a,b)=>(a.period||'').localeCompare(b.period||'')).map(p=>`<tr><td>${p.period}</td><td>${p.hours}</td><td>${money(p.gross)}</td><td>${p.status||'issued'}</td><td><button class="button" disabled>Download</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No paystubs yet.</td></tr>';
  }

  // PTO
  function loadPTO(){ return store.get(KEYS.pto, []); } function savePTO(v){ store.set(KEYS.pto,v); renderPTO(); }
  const ptoForm=byId('pto-form'); const ptoStatus=byId('pto_status');
  ptoForm?.addEventListener('submit',(e)=>{ e.preventDefault(); const list=loadPTO(); list.push({ id:crypto.randomUUID(), employee: myEmail(), from: byId('pto_from').value, to: byId('pto_to').value, reason: byId('pto_reason').value.trim(), status:'pending' }); savePTO(list); ptoStatus.textContent='Request submitted.'; ptoForm.reset(); });
  function renderPTO(){
    const me=(myEmail()||'').toLowerCase();
    $('#pto_table_emp tbody').innerHTML = loadPTO().filter(p=>(p.employee||'').toLowerCase()===me).sort((a,b)=>a.from<b.from?1:-1).map(p=>`<tr><td>${p.from||''}</td><td>${p.to||''}</td><td>${p.reason||''}</td><td>${p.status||'pending'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No requests.</td></tr>';
  }

  // comments on completed
  function loadEmpComments(){ return store.get(KEYS.emp_comments, []); } function saveEmpComments(v){ store.set(KEYS.emp_comments,v); renderEmpComments(); }
  const cmForm=byId('emp-comment-form'); const cmStatus=byId('cmpl_status'); const cmSel=byId('cmpl_job');
  function refreshCompletedJobsForComments(){
    const me=(myEmail()||'').toLowerCase();
    const jobs=loadReviews().filter(r=>(r.employee||'').toLowerCase()===me);
    cmSel.innerHTML = jobs.map(j=>`<option value="${j.id}">${j.date||''} • ${j.title||''}</option>`).join('') || '<option value="">No completed jobs yet</option>';
  }
  cmForm?.addEventListener('submit',(e)=>{ e.preventDefault(); const jobId=cmSel.value; if(!jobId){ cmStatus.textContent='No job selected.'; return; } const list=loadEmpComments(); list.push({ id:crypto.randomUUID(), employee: myEmail(), job_review_id:jobId, text: byId('cmpl_notes').value.trim(), date: todayISO(), status:'submitted' }); saveEmpComments(list); cmStatus.textContent='Comment submitted.'; cmForm.reset(); });
  function renderEmpComments(){
    const me=(myEmail()||'').toLowerCase();
    $('#emp_comments_table tbody').innerHTML = loadEmpComments().filter(c=>(c.employee||'').toLowerCase()===me).sort((a,b)=>a.date<b.date?1:-1).map(c=>`<tr><td>${c.date}</td><td>${c.job_review_id}</td><td>${c.text||''}</td><td>${c.status||''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No comments yet.</td></tr>';
  }

  // init
  renderToday(); renderWeek(); refreshCompleteSelect(); renderCompletions(); renderHours(); renderPaystubs(); renderPTO(); refreshCompletedJobsForComments(); renderEmpComments();
})();
