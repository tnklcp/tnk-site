/* =========================================================
   TNK Employee Portal (front-end demo)
   - Auth guard (employee or admin)
   - Tabs
   - Today/Week schedule (read-only, from admin jobs)
   - Complete job (uploads -> stored refs), hours, PTO, paystubs, comments
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
    accounts: 'tnk_accounts',
    jobs: 'tnk_jobs',
    reviews: 'tnk_reviews',
    timesheets: 'tnk_timesheets',
    pto: 'tnk_pto',
    paystubs: 'tnk_paystubs',
    emp_comments: 'tnk_emp_comments'
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
  function getRole() {
    const r = sessionStorage.getItem('tnk_role');
    if (r) return r;
    const user = getIdentityUser();
    if (!user) return null;
    const email = (user.email || '').toLowerCase();
    const admins = (store.get('tnk_admin_emails', []) || []).map(x => x.toLowerCase());
    const employees = (store.get('tnk_employee_emails', []) || []).map(x => x.toLowerCase());
    if (admins.includes(email)) return 'admin';
    if (employees.includes(email)) return 'employee';
    return 'customer';
  }
  function assertEmployeeOrAdmin() {
    const role = getRole();
    if (role === 'employee' || role === 'admin') return true;
    window.location.replace('index.html');
    return false;
  }
  if (!assertEmployeeOrAdmin()) return;

  const logoutBtn = byId('emp-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { sessionStorage.removeItem('tnk_role'); sessionStorage.removeItem('tnk_user_email'); } catch {}
      try { if (window.netlifyIdentity && window.netlifyIdentity.currentUser()) await window.netlifyIdentity.logout(); } catch {}
      window.location.replace('index.html');
    });
  }

  // Who am I
  function myEmail() {
    const fromSession = sessionStorage.getItem('tnk_user_email');
    if (fromSession) return fromSession;
    const user = getIdentityUser(); return user?.email || '';
  }

  // ---------- Tabs ----------
  const tabs = $$('.tab-btn');
  const panels = {
    today: byId('panel-today'),
    week: byId('panel-week'),
    complete: byId('panel-complete'),
    hours: byId('panel-hours'),
    paystubs: byId('panel-paystubs'),
    pto: byId('panel-pto'),
    comments: byId('panel-comments'),
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

  // ---------- Data loaders ----------
  function loadJobs() { return store.get(KEYS.jobs, []); }
  function loadTimesheets() { return store.get(KEYS.timesheets, []); }
  function saveTimesheets(list) { store.set(KEYS.timesheets, list); renderHours(); }
  function loadReviews() { return store.get(KEYS.reviews, []); }
  function saveReviews(list) { store.set(KEYS.reviews, list); renderCompletions(); }
  function loadPTO() { return store.get(KEYS.pto, []); }
  function savePTO(list) { store.set(KEYS.pto, list); renderPTO(); }
  function loadPaystubs() { return store.get(KEYS.paystubs, []); }
  function loadEmpComments() { return store.get(KEYS.emp_comments, []); }
  function saveEmpComments(list) { store.set(KEYS.emp_comments, list); renderEmpComments(); }

  // ---------- Today ----------
  const todayBody = $('#emp_today_jobs tbody');
  const jobDrawer = byId('emp_job_drawer');
  function renderToday() {
    const me = (myEmail() || '').toLowerCase();
    const today = todayISO();
    const rows = loadJobs()
      .filter(j => j.date === today && (!j.assignee || j.assignee.toLowerCase() === me))
      .sort((a,b)=> (a.start || '').localeCompare(b.start || ''))
      .map(j => `<tr data-id="${j.id}"><td>${j.start || ''}</td><td>${j.customer || ''}</td><td>${j.title || ''}</td><td>${j.notes || ''}</td></tr>`)
      .join('');
    todayBody.innerHTML = rows || '<tr><td colspan="4" class="muted">No jobs today.</td></tr>';
  }
  todayBody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    const j = loadJobs().find(x => x.id === id);
    if (!j) return;
    jobDrawer.innerHTML = `
      <p><strong>${j.title || ''}</strong></p>
      <p><strong>Customer:</strong> ${j.customer || ''}</p>
      <p><strong>When:</strong> ${j.date || ''} ${j.start || ''}${j.end ? '–' + j.end : ''}</p>
      <p><strong>Notes:</strong> ${j.notes || ''}</p>
      <p><strong>Status:</strong> ${j.status || 'scheduled'}</p>
    `;
  });

  // ---------- Week ----------
  function renderWeek() {
    const me = (myEmail() || '').toLowerCase();
    const jobs = loadJobs().filter(j => !j.assignee || j.assignee.toLowerCase() === me);
    if (jobs.length === 0) { byId('emp_week_calendar').innerHTML = '<p class="muted">No jobs.</p>'; return; }
    const rows = jobs.sort((a,b)=> (a.date || '').localeCompare(b.date || '') || (a.start||'').localeCompare(b.start||''))
      .map(j => `<div class="slot"><div>${j.date} ${j.start || ''}</div><div><strong>${(j.customer || '').split('@')[0]}</strong> — ${j.title || ''}</div></div>`)
      .join('');
    byId('emp_week_calendar').innerHTML = rows;
  }

  // ---------- Complete job ----------
  const cForm = byId('emp-complete-form');
  const cJobSel = byId('c_job');
  const cStatus = byId('c_status');

  function refreshCompleteJobSelect() {
    const me = (myEmail() || '').toLowerCase();
    const options = loadJobs()
      .filter(j => (!j.assignee || j.assignee.toLowerCase() === me) && (j.status === 'scheduled' || j.status === 'in_progress'))
      .sort((a,b)=> (a.date || '').localeCompare(b.date || ''))
      .map(j => `<option value="${j.id}">${j.date} • ${j.title} (${j.customer})</option>`)
      .join('');
    cJobSel.innerHTML = `<option value="">Select…</option>${options}`;
  }

  cForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = cJobSel.value;
    if (!id) { cStatus.textContent = 'Pick a job.'; return; }
    const jobs = loadJobs();
    const j = jobs.find(x => x.id === id);
    if (!j) { cStatus.textContent = 'Job not found.'; return; }

    // Collect simple photo names (for demo)
    const files = Array.from(byId('c_photos').files || []);
    const photoNames = files.map(f => f.name);

    // Push to admin review queue
    const reviews = loadReviews();
    reviews.push({
      id: crypto.randomUUID(),
      job_id: j.id,
      date: j.date,
      customer: j.customer,
      title: j.title,
      notes: byId('c_notes').value.trim(),
      photos: photoNames,
      employee: myEmail(),
      status: 'pending'
    });
    store.set(KEYS.reviews, reviews);

    // Update job status locally
    j.status = 'complete_pending_review';
    store.set(KEYS.jobs, jobs);

    cStatus.textContent = 'Submitted for admin review.';
    cForm.reset();
    refreshCompleteJobSelect();
    renderCompletions();
  });

  function renderCompletions() {
    const me = (myEmail() || '').toLowerCase();
    const rows = loadReviews()
      .filter(r => (r.employee || '').toLowerCase() === me)
      .sort((a,b)=> (a.date < b.date ? 1 : -1))
      .map(r => `<tr><td>${r.date || ''}</td><td>${r.title || ''}</td><td>${r.status || 'pending'}</td><td>${r.notes || ''}</td></tr>`)
      .join('');
    $('#emp_completions tbody').innerHTML = rows || '<tr><td colspan="4" class="muted">No submissions.</td></tr>';
  }

  // ---------- Hours ----------
  const ehForm = byId('emp-hours-form');
  const ehStatus = byId('eh_status');

  function renderHours() {
    const me = (myEmail() || '').toLowerCase();
    const rows = loadTimesheets()
      .filter(t => (t.employee_email || '').toLowerCase() === me)
      .sort((a,b)=> (a.date < b.date ? 1 : -1))
      .map(t => `<tr><td>${t.date}</td><td>${t.hours || (t.start_time && t.end_time ? '—' : 0)}</td><td>${t.approved ? 'approved' : 'pending'}</td><td>${t.notes || ''}</td></tr>`)
      .join('');
    $('#emp_hours_table tbody').innerHTML = rows || '<tr><td colspan="4" class="muted">No hours yet.</td></tr>';
  }

  ehForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const list = loadTimesheets();
    list.push({
      id: crypto.randomUUID(),
      employee_email: myEmail(),
      date: byId('eh_date').value,
      hours: Number(byId('eh_hours').value || 0),
      start_time: '', end_time: '',
      notes: byId('eh_notes').value.trim(),
      approved: false
    });
    saveTimesheets(list);
    ehStatus.textContent = 'Saved.';
    ehForm.reset();
  });

  // ---------- Paystubs (read-only) ----------
  function renderPaystubs() {
    const me = (myEmail() || '').toLowerCase();
    const rows = loadPaystubs()
      .filter(p => (p.employee || '').toLowerCase() === me)
      .sort((a,b)=> (a.period || '').localeCompare(b.period || ''))
      .map(p => `<tr><td>${p.period}</td><td>${p.hours}</td><td>${fmtMoney(p.gross)}</td><td>${p.status || 'issued'}</td><td><button class="button" disabled>Download</button></td></tr>`)
      .join('');
    $('#emp_paystubs tbody').innerHTML = rows || '<tr><td colspan="5" class="muted">No paystubs yet.</td></tr>';
  }

  // ---------- PTO ----------
  const ptoForm = byId('pto-form');
  const ptoStatus = byId('pto_status');

  function renderPTO() {
    const me = (myEmail() || '').toLowerCase();
    const rows = loadPTO()
      .filter(x => (x.employee || '').toLowerCase() === me)
      .sort((a,b)=> (a.from < b.from ? 1 : -1))
      .map(x => `<tr><td>${x.from || ''}</td><td>${x.to || ''}</td><td>${x.reason || ''}</td><td>${x.status || 'pending'}</td></tr>`)
      .join('');
    $('#pto_table_emp tbody').innerHTML = rows || '<tr><td colspan="4" class="muted">No requests.</td></tr>';
  }

  ptoForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const list = loadPTO();
    list.push({
      id: crypto.randomUUID(),
      employee: myEmail(),
      from: byId('pto_from').value,
      to: byId('pto_to').value,
      reason: byId('pto_reason').value.trim(),
      status: 'pending'
    });
    savePTO(list);
    ptoStatus.textContent = 'Request submitted.';
    ptoForm.reset();
  });

  // ---------- Comments (on completed jobs) ----------
  const cmplForm = byId('emp-comment-form');
  const cmplStatus = byId('cmpl_status');
  const cmplJobSel = byId('cmpl_job');

  function refreshCompletedJobsForComments() {
    const me = (myEmail() || '').toLowerCase();
    const jobs = loadReviews().filter(r => (r.employee || '').toLowerCase() === me);
    cmplJobSel.innerHTML = (jobs.map(j => `<option value="${j.id}">${j.date || ''} • ${j.title || ''}</option>`).join('')) || '<option value="">No completed jobs yet</option>';
  }

  cmplForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const jobId = cmplJobSel.value; if (!jobId) { cmplStatus.textContent = 'No job selected.'; return; }
    const list = loadEmpComments();
    list.push({
      id: crypto.randomUUID(),
      employee: myEmail(),
      job_review_id: jobId,
      text: byId('cmpl_notes').value.trim(),
      date: todayISO(),
      status: 'submitted'
    });
    saveEmpComments(list);
    cmplStatus.textContent = 'Comment submitted.';
    cmplForm.reset();
  });

  function renderEmpComments() {
    const me = (myEmail() || '').toLowerCase();
    const rows = loadEmpComments()
      .filter(c => (c.employee || '').toLowerCase() === me)
      .sort((a,b)=> (a.date < b.date ? 1 : -1))
      .map(c => `<tr><td>${c.date}</td><td>${c.job_review_id}</td><td>${c.text || ''}</td><td>${c.status || ''}</td></tr>`)
      .join('');
    $('#emp_comments_table tbody').innerHTML = rows || '<tr><td colspan="4" class="muted">No comments yet.</td></tr>';
  }

  // ---------- Init ----------
  renderToday();
  renderWeek();
  refreshCompleteJobSelect();
  renderCompletions();
  renderHours();
  renderPaystubs();
  renderPTO();
  refreshCompletedJobsForComments();
  renderEmpComments();

})();
